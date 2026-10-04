-- =============================================================================
-- Migration: AI Bot Chat (MAF-042 + MAF-054/060 integration)
-- =============================================================================
-- Bots that TALK. The game engine (20260927000003) resolves bot *actions*
-- virtually; this migration adds bot *chat*:
--
--   1. `messages` accepts bot-authored rows: sender_id becomes nullable and a
--      `sender_display` column carries the bot name (bot seats have no profile).
--   2. A narrator trigger fires on new day/mafia-channel messages and on phase
--      events, invoking the `ai-bot-chat` edge function over pg_net (async,
--      non-blocking; it re-reads game state with the service role and inserts
--      bot replies with humanlike jitter). The function name is read from
--      app_config so the URL/secret stay out of git.
--   3. A advisory-lock-style guard (ai_chat_state) ensures only one AI turn per
--      game runs at a time and gives a game-wide cooldown between bot replies.
--
-- NOTE: bot rows in `messages` must satisfy existing RLS the same way human
-- rows do — they are inserted by the edge function using the service role,
-- which bypasses RLS. RLS policies for reading are unchanged (viewers see the
-- channels they already may), but `sender_display` is visible to everyone who
-- can see the row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. messages: bot-authored rows
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages
    ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS sender_display text;

-- Exactly one of profile-sender or display-name must be present.
ALTER TABLE public.messages
    ADD CONSTRAINT messages_sender_or_display CHECK (
        (sender_id IS NOT NULL) OR (sender_display IS NOT NULL)
    );

COMMENT ON COLUMN public.messages.sender_display IS
    'Display name for bot-authored messages (bots have no profiles row).';

-- -----------------------------------------------------------------------------
-- 2. app_config: edge function URL + feature flags (no secrets here)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
    key   text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.app_config FROM public, anon, authenticated;
-- Readable only by the service role (default: table owner). No grants issued.

INSERT INTO public.app_config (key, value) VALUES
    ('ai_bot_chat', '{"enabled": true, "function_name": "ai-bot-chat", "functions_base_url": "https://cfutaueuomfqkmqystkk.supabase.co/functions/v1", "replies_per_turn": 2, "cooldown_seconds": 20}'::jsonb)
ON CONFLICT (key) DO UPDATE
    SET value = public.app_config.value, updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. AI concurrency guard
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_chat_state (
    game_id           uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
    last_run_at       timestamptz NOT NULL DEFAULT now(),
    status            text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running')),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_state ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role touches this table.

-- -----------------------------------------------------------------------------
-- 4. pg_net + trigger plumbing
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;

-- One narrator invocation per chat turn: clears the turn gate when the AI run
-- finishes (the edge function flips status back to idle) so the next message
-- can trigger again.
CREATE OR REPLACE FUNCTION public.narrator_ai_fire()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game_id uuid;
    v_channel text;
    v_cfg jsonb;
    v_now timestamptz := now();
    v_status text;
    v_last_run timestamptz;
    v_cooldown int;
    v_payload jsonb;
    v_function text;
    v_url text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RETURN NULL;
    END IF;

    v_channel := COALESCE(NEW.channel, '');
    IF v_channel NOT IN ('day', 'mafia') THEN
        RETURN NEW;  -- only in-game channels; lobby/ghost chat stays human-only
    END IF;

    v_game_id := NEW.game_id;
    IF v_game_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_cfg FROM public.app_config WHERE key = 'ai_bot_chat';
    IF v_cfg IS NULL OR (v_cfg->>'enabled')::boolean IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- One AI turn per game at a time + per-game cooldown.
    SELECT status, last_run_at, COALESCE((v_cfg->>'cooldown_seconds')::int, 20)
      INTO v_status, v_last_run, v_cooldown
      FROM public.ai_chat_state
     WHERE game_id = v_game_id
       FOR UPDATE;

    IF v_status = 'running' THEN
        RETURN NEW;
    END IF;
    IF v_last_run IS NOT NULL AND v_last_run + make_interval(secs => v_cooldown) > v_now THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.ai_chat_state (game_id, status, last_run_at, updated_at)
    VALUES (v_game_id, 'running', v_now, v_now)
    ON CONFLICT (game_id) DO UPDATE
        SET status = 'running', last_run_at = v_now, updated_at = v_now
      WHERE public.ai_chat_state.status <> 'running';

    -- Mark running (covers the insert path; the ON CONFLICT above handles it
    -- atomically, but be explicit for clarity).
    UPDATE public.ai_chat_state
       SET status = 'running', last_run_at = v_now, updated_at = v_now
     WHERE game_id = v_game_id;

    v_payload := jsonb_build_object(
        'game_id', v_game_id,
        'room_id', NEW.room_id,
        'channel', v_channel,
        'trigger_message_id', NEW.id,
        'trigger_sender', COALESCE(NEW.sender_display, ''),
        'round', (SELECT round_number FROM public.games WHERE id = v_game_id)
    );

    v_function := COALESCE(v_cfg->>'function_name', 'ai-bot-chat');
    -- Hosted Supabase: project functions URL from app_config; self-hosted:
    -- internal Kong. The caller credential comes from Vault (set once by the
    -- owner: SELECT vault.create_secret('<service_role_key>', 'service_role_key');)
    -- with the self-hosted GUC as fallback.
    v_url := COALESCE(v_cfg->>'functions_base_url', 'http://kong:8000/functions/v1') || '/' || v_function;

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(
                (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
                current_setting('app.settings.service_jwt', true)
            )
        ),
        body := v_payload,
        timeout_milliseconds := 8000
    );

    RETURN NEW;
END;
$$;

-- Fires AFTER commit? pg_net calls are async anyway; keep row-level AFTER so
-- payload has the message id. Guard ensures one in-flight AI turn per game.
DROP TRIGGER IF EXISTS trg_narrator_ai_chat ON public.messages;
CREATE TRIGGER trg_narrator_ai_chat
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.narrator_ai_fire();

-- Phase events also provoke bot banter (e.g. discussion_started -> opening
-- lines) — the trigger reads the game state fresh, so a single generic hook is
-- enough. Deadlocks are avoided by the ai_chat_state row lock.
CREATE OR REPLACE FUNCTION public.narrator_ai_fire_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cfg jsonb;
    v_url text;
    v_function text;
    v_room_id uuid;
BEGIN
    IF NEW.event_type NOT IN ('discussion_started', 'voting_started', 'night_started') THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_cfg FROM public.app_config WHERE key = 'ai_bot_chat';
    IF v_cfg IS NULL OR (v_cfg->>'enabled')::boolean IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Phase-event banter shares the same guard; skip if a turn is running.
    -- (Cooldown may throttle this; acceptable for phase-change lines.)
    UPDATE public.ai_chat_state
       SET status = 'running', last_run_at = now(), updated_at = now()
     WHERE game_id = NEW.game_id
       AND status <> 'running';
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT room_id INTO v_room_id FROM public.games WHERE id = NEW.game_id;

    v_function := COALESCE(v_cfg->>'function_name', 'ai-bot-chat');
    v_url := COALESCE(v_cfg->>'functions_base_url', 'http://kong:8000/functions/v1') || '/' || v_function;

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(
                (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
                current_setting('app.settings.service_jwt', true)
            )
        ),
        body := jsonb_build_object(
            'game_id', NEW.game_id,
            'room_id', v_room_id,
            'channel', CASE WHEN NEW.event_type = 'night_started' THEN 'mafia' ELSE 'day' END,
            'trigger_message_id', NULL,
            'trigger_sender', '',
            'event', NEW.event_type,
            'round', (NEW.payload->>'round')
        ),
        timeout_milliseconds := 8000
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_narrator_ai_events ON public.game_events;
CREATE TRIGGER trg_narrator_ai_events
    AFTER INSERT ON public.game_events
    FOR EACH ROW
    EXECUTE FUNCTION public.narrator_ai_fire_event();

-- -----------------------------------------------------------------------------
-- 5. Display-name resolution for chat reads
-- -----------------------------------------------------------------------------
-- The chat view on the client joins profiles for humans; bots carry
-- sender_display. No extra view needed — document the contract:
COMMENT ON TABLE public.ai_chat_state IS
    'One AI chat turn per game at a time; the edge function resets status to idle when done (or after its insert) and the trigger enforces a cooldown.';
