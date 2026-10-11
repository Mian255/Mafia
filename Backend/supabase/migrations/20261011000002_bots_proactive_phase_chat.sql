-- =============================================================================
-- Migration: Bots speak proactively at phase start (discussion/voting/night)
-- Date: 2026-10-11
-- =============================================================================
-- Fixes a silent-bot bug in narrator_ai_fire_event() (20260927000004):
--
--   The event trigger only ran an UPDATE on ai_chat_state:
--       UPDATE ai_chat_state SET status='running' WHERE game_id = ... AND status <> 'running';
--       IF NOT FOUND THEN RETURN NEW;   -- abort
--
--   For a FRESH game the ai_chat_state row is created lazily by the *message*
--   trigger (narrator_ai_fire), so at `discussion_started` no row exists yet.
--   The UPDATE matches zero rows -> NOT FOUND -> the bot is never invoked.
--   Result: bots stayed silent in the day discussion unless a human messaged
--   first. The same abort silently swallowed `voting_started` / `night_started`
--   on a game that had not seen any chat.
--
--   Fix: upsert the guard row (idle, back-dated) so the claim UPDATE can
--   succeed, then claim the turn atomically. Behaviour is otherwise identical —
--   one in-flight AI turn per game, released by the edge function.
--
-- SAFE: idempotent (OR REPLACE); replaces only narrator_ai_fire_event(); the
-- trigger itself (trg_narrator_ai_events) is unchanged and already fires on the
-- three phase events.
-- =============================================================================

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
    v_claimed uuid;
BEGIN
    IF NEW.event_type NOT IN ('discussion_started', 'voting_started', 'night_started') THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_cfg FROM public.app_config WHERE key = 'ai_bot_chat';
    IF v_cfg IS NULL OR (v_cfg->>'enabled')::boolean IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Ensure a guard row exists so a fresh game (no chat yet) can still fire.
    -- Back-date last_run_at so the per-message cooldown never blocks a phase
    -- event; the event path is gated only by the 'running' claim below.
    INSERT INTO public.ai_chat_state (game_id, status, last_run_at, updated_at)
    VALUES (NEW.game_id, 'idle', now() - interval '1 hour', now())
    ON CONFLICT (game_id) DO NOTHING;

    -- Claim the turn: proceed only if no AI run is currently in-flight for this
    -- game. The UPDATE + FOUND check is atomic under the row lock, so two phase
    -- events racing one another cannot both fire.
    UPDATE public.ai_chat_state
       SET status = 'running', last_run_at = now(), updated_at = now()
     WHERE game_id = NEW.game_id
       AND status <> 'running'
    RETURNING game_id INTO v_claimed;

    IF v_claimed IS NULL THEN
        RETURN NEW;  -- a turn is already running for this game
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
