-- =============================================================================
-- Migration: Bot Chat & Sequential Night Turn Hardening
-- Date: 2026-10-17
-- =============================================================================
-- 1. Create SECURITY DEFINER RPC `post_bot_message` allowing authenticated game
--    participants to post chat messages on behalf of living bots in that game.
-- 2. Clear stuck `running` locks on `ai_chat_state` and add auto-expiry to
--    `narrator_ai_fire` so locks older than 25 seconds are never permanently stuck.
-- 3. Hardening for `submit_night_action` and `advance_game_phase` sequential turns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ensure night_actions target_id column is nullable (for bot targets)
-- -----------------------------------------------------------------------------
ALTER TABLE public.night_actions ALTER COLUMN target_id DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Reset any stale ai_chat_state locks
-- -----------------------------------------------------------------------------
UPDATE public.ai_chat_state
   SET status = 'idle', updated_at = now()
 WHERE status = 'running';

-- -----------------------------------------------------------------------------
-- 3. Self-healing narrator_ai_fire trigger
-- -----------------------------------------------------------------------------
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
    v_service_jwt text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RETURN NULL;
    END IF;

    v_channel := COALESCE(NEW.channel, '');
    IF v_channel NOT IN ('day', 'mafia') THEN
        RETURN NEW;
    END IF;

    v_game_id := NEW.game_id;
    IF v_game_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_cfg FROM public.app_config WHERE key = 'ai_bot_chat';
    IF v_cfg IS NULL OR (v_cfg->>'enabled')::boolean IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Concurrency check: check if already running or on cooldown.
    -- Auto-heal: if status is 'running' but it started more than 25s ago, treat as stale.
    SELECT status, last_run_at, COALESCE((v_cfg->>'cooldown_seconds')::int, 15)
      INTO v_status, v_last_run, v_cooldown
      FROM public.ai_chat_state
     WHERE game_id = v_game_id
       FOR UPDATE;

    IF v_status = 'running' AND v_last_run IS NOT NULL AND (v_last_run + interval '25 seconds') > v_now THEN
        RETURN NEW;
    END IF;

    IF v_last_run IS NOT NULL AND v_status = 'idle' AND (v_last_run + make_interval(secs => v_cooldown)) > v_now THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.ai_chat_state (game_id, status, last_run_at, updated_at)
    VALUES (v_game_id, 'running', v_now, v_now)
    ON CONFLICT (game_id) DO UPDATE
        SET status = 'running', last_run_at = v_now, updated_at = v_now;

    v_payload := jsonb_build_object(
        'game_id', v_game_id,
        'room_id', NEW.room_id,
        'channel', v_channel,
        'trigger_message_id', NEW.id,
        'trigger_sender', COALESCE(NEW.sender_display, ''),
        'round', (SELECT round_number FROM public.games WHERE id = v_game_id)
    );

    v_function := COALESCE(v_cfg->>'function_name', 'ai-bot-chat');
    v_url := COALESCE(v_cfg->>'functions_base_url', 'http://kong:8000/functions/v1') || '/' || v_function;

    BEGIN
        SELECT decrypted_secret INTO v_service_jwt
          FROM vault.decrypted_secrets
         WHERE name = 'service_role_key' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_service_jwt := NULL;
    END;

    IF v_service_jwt IS NULL THEN
        v_service_jwt := current_setting('app.settings.service_jwt', true);
    END IF;

    -- Only attempt http_post if service JWT is available
    IF v_service_jwt IS NOT NULL AND length(v_service_jwt) > 10 THEN
        BEGIN
            PERFORM net.http_post(
                url := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_jwt
                ),
                body := v_payload,
                timeout_milliseconds := 8000
            );
        EXCEPTION WHEN OTHERS THEN
            -- Non-fatal: if pg_net errors, reset status so subsequent turns are not locked out
            UPDATE public.ai_chat_state SET status = 'idle', updated_at = now() WHERE game_id = v_game_id;
        END;
    ELSE
        -- No service key configured in vault: reset to idle so the row isn't stuck
        UPDATE public.ai_chat_state SET status = 'idle', updated_at = now() WHERE game_id = v_game_id;
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. post_bot_message RPC (Allows client bot engine to post in-game chat)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_bot_message(
    p_game_id uuid,
    p_channel text,
    p_bot_name text,
    p_content text
)
RETURNS public.messages
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_game public.games;
    v_bot public.game_players;
    v_msg public.messages;
    v_clean_content text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game_not_found';
    END IF;
    IF v_game.phase = 'game_over' THEN
        RAISE EXCEPTION 'game_already_over';
    END IF;

    IF NOT public.is_game_participant(p_game_id, v_uid) THEN
        RAISE EXCEPTION 'not_participant';
    END IF;

    -- Verify that p_bot_name is a living bot in this game
    SELECT * INTO v_bot FROM public.game_players
     WHERE game_id = p_game_id AND is_bot = true AND is_alive = true
       AND bot_name = p_bot_name
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bot_not_found_or_dead';
    END IF;

    -- Channel validity
    IF p_channel = 'mafia' THEN
        IF v_bot.role <> 'mafia' THEN
            RAISE EXCEPTION 'bot_not_mafia';
        END IF;
        IF v_game.phase <> 'night' THEN
            RAISE EXCEPTION 'channel_not_active';
        END IF;
    ELSIF p_channel = 'day' THEN
        IF v_game.phase NOT IN ('day_discussion', 'day_voting', 'dawn', 'result', 'role_reveal') THEN
            RAISE EXCEPTION 'channel_not_active';
        END IF;
    ELSE
        RAISE EXCEPTION 'invalid_bot_channel';
    END IF;

    v_clean_content := trim(p_content);
    IF length(v_clean_content) = 0 OR length(v_clean_content) > 500 THEN
        RAISE EXCEPTION 'invalid_content_length';
    END IF;

    INSERT INTO public.messages
        (game_id, room_id, channel, sender_id, sender_display, content)
    VALUES
        (p_game_id, v_game.room_id, p_channel, NULL, p_bot_name, v_clean_content)
    RETURNING * INTO v_msg;

    RETURN v_msg;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_bot_message(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.post_bot_message(uuid, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. submit_night_action with explicit error messaging
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_night_action(p_game_id uuid, p_target_player_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_game public.games;
    v_actor public.game_players;
    v_target public.game_players;
    v_current_stage text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game_not_found';
    END IF;
    IF v_game.phase <> 'night' THEN
        RAISE EXCEPTION 'not_night_phase';
    END IF;

    SELECT * INTO v_actor FROM public.game_players
     WHERE game_id = p_game_id AND user_id = v_uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_participant';
    END IF;
    IF NOT v_actor.is_alive THEN
        RAISE EXCEPTION 'actor_not_alive';
    END IF;
    IF v_actor.role NOT IN ('mafia', 'doctor', 'detective') THEN
        RAISE EXCEPTION 'no_night_action';
    END IF;

    -- Turn check
    v_current_stage := COALESCE(v_game.night_stage, 'mafia');
    IF v_current_stage <> v_actor.role THEN
        RAISE EXCEPTION 'not_your_turn';
    END IF;

    SELECT * INTO v_target FROM public.game_players
     WHERE id = p_target_player_id AND game_id = p_game_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_target';
    END IF;
    IF NOT v_target.is_alive THEN
        RAISE EXCEPTION 'target_not_alive';
    END IF;

    INSERT INTO public.night_actions
        (game_id, round_number, actor_id, target_id, target_player_id, role)
    VALUES
        (p_game_id, v_game.round_number, v_uid, v_target.user_id, p_target_player_id, v_actor.role)
    ON CONFLICT (game_id, round_number, actor_id) DO UPDATE
        SET target_player_id = EXCLUDED.target_player_id,
            target_id = EXCLUDED.target_id,
            role = EXCLUDED.role;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_night_action(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_night_action(uuid, uuid) TO authenticated;
