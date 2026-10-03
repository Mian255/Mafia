-- =============================================================================
-- Migration: Mafia Game Engine
-- Date: 2026-09-27
-- Adds the server-authoritative core game loop:
--   * Schema: collapse the three sequential night sub-phases into one 'night';
--     make game_players / night_actions / votes bot-aware and seat-targeted.
--   * RPCs (SECURITY DEFINER): start_game, submit_night_action, cast_vote,
--     advance_game_phase (the tick/resolver), get_investigation_result.
--   * Recreate game_players_view to expose bot columns while keeping role masking.
-- All statements are idempotent (IF EXISTS / OR REPLACE / IF NOT EXISTS).
-- Every SECURITY DEFINER function SETs search_path = public; EXECUTE is REVOKEd
-- from public and GRANTed to authenticated. Reuses helpers is_game_participant,
-- is_mafia_player, is_game_over from 20260920000001_initial_schema.sql.
-- SAFE: no game rows exist yet, so the phase CHECK swap and the unique-constraint
-- swap on game_players cannot violate existing data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema changes
-- -----------------------------------------------------------------------------

-- games.phase: collapse the three sequential night sub-phases into one 'night'.
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_phase_check;
ALTER TABLE public.games
    ADD CONSTRAINT games_phase_check CHECK (phase IN (
        'role_reveal', 'night', 'dawn', 'day_discussion', 'day_voting', 'result', 'game_over'
    ));

-- game_players: make bot-aware and seat-numbered.
ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;
ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS bot_name text;
ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS bot_avatar text;
ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS seat_number int;
ALTER TABLE public.game_players ALTER COLUMN user_id DROP NOT NULL;

-- Replace the (game_id, user_id) unique CONSTRAINT with a partial unique INDEX so
-- multiple bot rows (user_id IS NULL) are allowed while humans stay unique.
ALTER TABLE public.game_players DROP CONSTRAINT IF EXISTS unique_game_player;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_game_players_game_user
    ON public.game_players (game_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_game_players_game_seat
    ON public.game_players (game_id, seat_number);

-- night_actions / votes: target a SEAT (game_players.id), not a profile, so bots
-- can be targeted. Keep target_id (profile) for humans but make it optional.
ALTER TABLE public.night_actions
    ADD COLUMN IF NOT EXISTS target_player_id uuid REFERENCES public.game_players(id) ON DELETE CASCADE;
ALTER TABLE public.night_actions ALTER COLUMN target_id DROP NOT NULL;

ALTER TABLE public.votes
    ADD COLUMN IF NOT EXISTS target_player_id uuid REFERENCES public.game_players(id) ON DELETE CASCADE;

-- Hot-path indexes for the resolver.
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON public.game_players (game_id);
CREATE INDEX IF NOT EXISTS idx_night_actions_game_round ON public.night_actions (game_id, round_number);
CREATE INDEX IF NOT EXISTS idx_votes_game_round ON public.votes (game_id, round_number);

-- -----------------------------------------------------------------------------
-- 2. Recreate game_players_view (adds bot columns + seat_number; masking intact).
-- Matches 20260927000001_rls_hardening.sql; security_invoker = false so the view
-- bypasses base-table RLS and returns the full roster, while `role` stays masked
-- (NULL) unless the caller is that player, a fellow mafia, or the game is over.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.game_players_view;
CREATE VIEW public.game_players_view
WITH (security_invoker = false) AS
    SELECT
        gp.id,
        gp.game_id,
        gp.user_id,
        CASE
            WHEN gp.user_id = auth.uid()
                OR (gp.role = 'mafia' AND public.is_mafia_player(gp.game_id, auth.uid()))
                OR public.is_game_over(gp.game_id)
            THEN gp.role
            ELSE NULL
        END AS role,
        gp.is_alive,
        gp.is_bot,
        gp.bot_name,
        gp.bot_avatar,
        gp.seat_number,
        gp.death_round,
        gp.death_phase,
        gp.death_reason,
        gp.created_at
    FROM public.game_players gp
    WHERE public.is_game_participant(gp.game_id, auth.uid());

REVOKE ALL ON public.game_players_view FROM anon;
GRANT SELECT ON public.game_players_view TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. start_game — host starts the game; seats + roles assigned atomically.
-- Shuffles room_players (humans + bots) into game_players seats, assigns roles
-- from room_settings, flips rooms.status, and emits a 'game_started' event.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_game(p_room_id uuid)
RETURNS public.games
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_room public.rooms;
    v_mafia_count int;
    v_doctor_enabled boolean;
    v_detective_enabled boolean;
    v_night_dur int;
    v_total int;
    v_town_count int;
    v_doctor_seat int;
    v_detective_seat int;
    v_game public.games;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'room_not_found';
    END IF;
    IF v_room.host_id <> v_uid THEN
        RAISE EXCEPTION 'not_host';
    END IF;
    IF v_room.status <> 'lobby' THEN
        RAISE EXCEPTION 'not_in_lobby';
    END IF;

    -- Role config from room_settings (fall back to schema defaults if absent).
    SELECT mafia_count, doctor_enabled, detective_enabled, night_duration_seconds
      INTO v_mafia_count, v_doctor_enabled, v_detective_enabled, v_night_dur
      FROM public.room_settings WHERE room_id = p_room_id;
    IF NOT FOUND THEN
        v_mafia_count := 1;
        v_doctor_enabled := true;
        v_detective_enabled := true;
        v_night_dur := 30;
    END IF;

    SELECT count(*) INTO v_total FROM public.room_players WHERE room_id = p_room_id;
    IF v_total < 4 THEN
        RAISE EXCEPTION 'not_enough_players';
    END IF;

    -- town = everyone who is not mafia (doctor/detective are town specials).
    v_town_count := v_total - v_mafia_count;
    IF v_mafia_count < 1 OR v_mafia_count >= v_town_count THEN
        RAISE EXCEPTION 'invalid_role_config';
    END IF;
    -- The special town roles must fit among the town seats.
    IF (v_town_count
        - (CASE WHEN v_doctor_enabled THEN 1 ELSE 0 END)
        - (CASE WHEN v_detective_enabled THEN 1 ELSE 0 END)) < 0 THEN
        RAISE EXCEPTION 'invalid_role_config';
    END IF;

    -- Seat indexes (1-based) that receive the special town roles, or -1 (unused).
    v_doctor_seat := CASE WHEN v_doctor_enabled THEN v_mafia_count + 1 ELSE -1 END;
    v_detective_seat := CASE WHEN v_detective_enabled
        THEN v_mafia_count + (CASE WHEN v_doctor_enabled THEN 1 ELSE 0 END) + 1
        ELSE -1 END;

    -- Create the game (role reveal first; short deadline).
    INSERT INTO public.games (room_id, phase, round_number, phase_deadline)
    VALUES (p_room_id, 'role_reveal', 1, now() + make_interval(secs => 10))
    RETURNING * INTO v_game;

    -- Shuffle room_players into seats and assign roles by seat index.
    INSERT INTO public.game_players
        (game_id, user_id, role, is_alive, is_bot, bot_name, bot_avatar, seat_number)
    SELECT
        v_game.id,
        s.user_id,
        CASE
            WHEN s.rn <= v_mafia_count THEN 'mafia'
            WHEN s.rn = v_doctor_seat THEN 'doctor'
            WHEN s.rn = v_detective_seat THEN 'detective'
            ELSE 'civilian'
        END,
        true,
        s.is_bot,
        s.bot_name,
        s.bot_avatar,
        s.rn
    FROM (
        SELECT rp.user_id, rp.is_bot, rp.bot_name, rp.bot_avatar,
               row_number() OVER (ORDER BY random()) AS rn
        FROM public.room_players rp
        WHERE rp.room_id = p_room_id
    ) s;

    UPDATE public.rooms SET status = 'in_progress' WHERE id = p_room_id;

    INSERT INTO public.game_events (game_id, event_type, payload)
    VALUES (v_game.id, 'game_started', jsonb_build_object('round', 1));

    RETURN v_game;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_game(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.start_game(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. submit_night_action — a living mafia/doctor/detective picks a living seat.
-- UPSERT keyed on (game_id, round_number, actor_id) so a player can change their
-- choice before the deadline. Only humans ever write here; bot choices are
-- resolved virtually inside advance_game_phase.
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

-- -----------------------------------------------------------------------------
-- 5. cast_vote — a living participant votes for a living seat, or NULL to skip.
-- UPSERT keyed on (game_id, round_number, voter_id). Only humans write here.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_vote(p_game_id uuid, p_target_player_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_game public.games;
    v_voter public.game_players;
    v_target public.game_players;
    v_target_user_id uuid := NULL;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game_not_found';
    END IF;
    IF v_game.phase <> 'day_voting' THEN
        RAISE EXCEPTION 'not_voting_phase';
    END IF;

    SELECT * INTO v_voter FROM public.game_players
     WHERE game_id = p_game_id AND user_id = v_uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_participant';
    END IF;
    IF NOT v_voter.is_alive THEN
        RAISE EXCEPTION 'voter_not_alive';
    END IF;

    IF p_target_player_id IS NOT NULL THEN
        SELECT * INTO v_target FROM public.game_players
         WHERE id = p_target_player_id AND game_id = p_game_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_target';
        END IF;
        IF NOT v_target.is_alive THEN
            RAISE EXCEPTION 'target_not_alive';
        END IF;
        v_target_user_id := v_target.user_id;
    END IF;

    INSERT INTO public.votes
        (game_id, round_number, voter_id, target_id, target_player_id)
    VALUES
        (p_game_id, v_game.round_number, v_uid, v_target_user_id, p_target_player_id)
    ON CONFLICT (game_id, round_number, voter_id) DO UPDATE
        SET target_player_id = EXCLUDED.target_player_id,
            target_id = EXCLUDED.target_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_vote(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cast_vote(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. advance_game_phase — the server-authoritative tick + resolver.
-- Any participant (living or dead) may call it. It locks the games row, re-checks
-- the deadline (early-advancing night/voting once every living HUMAN has acted),
-- resolves night/vote outcomes with virtual bot choices, checks win conditions,
-- and moves to the next phase. Idempotent under concurrency: FOR UPDATE + the
-- deadline re-check mean a late/duplicate call whose work is already done just
-- returns the current row (no double resolution).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_game_phase(p_game_id uuid)
RETURNS public.games
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_game public.games;
    v_night_dur int := 30;
    v_disc_dur int := 90;
    v_vote_dur int := 30;
    v_reveal boolean := true;
    v_can_advance boolean := false;
    v_expected int;
    v_acted int;
    v_new_phase text;
    v_new_round int;
    v_new_deadline timestamptz;
    v_event text;
    v_kill_target uuid;
    v_save_target uuid;
    v_elim_target uuid;
    v_died uuid;
    v_saved boolean := false;
    v_mafia_alive int;
    v_town_alive int;
    v_winner text := NULL;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game_not_found';
    END IF;
    IF NOT public.is_game_participant(p_game_id, v_uid) THEN
        RAISE EXCEPTION 'not_participant';
    END IF;

    -- Terminal state: nothing to do.
    IF v_game.phase = 'game_over' THEN
        RETURN v_game;
    END IF;

    -- Phase durations from room_settings (defaults if the row is missing).
    SELECT night_duration_seconds, discussion_duration_seconds,
           voting_duration_seconds, reveal_role_on_death
      INTO v_night_dur, v_disc_dur, v_vote_dur, v_reveal
      FROM public.room_settings WHERE room_id = v_game.room_id;
    IF NOT FOUND THEN
        v_night_dur := 30;
        v_disc_dur := 90;
        v_vote_dur := 30;
        v_reveal := true;
    END IF;

    -- Deadline gate. Night / voting may early-advance once every living human acted.
    v_can_advance := (v_game.phase_deadline IS NOT NULL AND now() >= v_game.phase_deadline);

    IF v_game.phase = 'night' THEN
        SELECT count(*) INTO v_expected
          FROM public.game_players
         WHERE game_id = p_game_id AND is_alive AND user_id IS NOT NULL
           AND role IN ('mafia', 'doctor', 'detective');
        SELECT count(*) INTO v_acted
          FROM public.night_actions
         WHERE game_id = p_game_id AND round_number = v_game.round_number;
        IF v_expected > 0 AND v_acted >= v_expected THEN
            v_can_advance := true;
        END IF;
    ELSIF v_game.phase = 'day_voting' THEN
        SELECT count(*) INTO v_expected
          FROM public.game_players
         WHERE game_id = p_game_id AND is_alive AND user_id IS NOT NULL;
        SELECT count(*) INTO v_acted
          FROM public.votes
         WHERE game_id = p_game_id AND round_number = v_game.round_number;
        IF v_expected > 0 AND v_acted >= v_expected THEN
            v_can_advance := true;
        END IF;
    END IF;

    IF NOT v_can_advance THEN
        RETURN v_game;  -- deadline not reached and not all humans acted: no-op.
    END IF;

    -- ------------------------------------------------------------------
    -- Phase transition.
    -- ------------------------------------------------------------------
    IF v_game.phase = 'role_reveal' THEN
        v_new_phase := 'night';
        v_new_deadline := now() + make_interval(secs => v_night_dur);
        v_event := 'night_started';

    ELSIF v_game.phase = 'night' THEN
        -- Mafia kill target: plurality of {human mafia actions} + {bot mafia picks}.
        -- MATERIALIZED forces a single evaluation of the volatile random() picks.
        WITH bot_kills AS MATERIALIZED (
            SELECT pick.tid
            FROM public.game_players bm
            CROSS JOIN LATERAL (
                SELECT gp2.id AS tid
                FROM public.game_players gp2
                WHERE gp2.game_id = p_game_id AND gp2.is_alive AND gp2.role <> 'mafia'
                ORDER BY random() LIMIT 1
            ) pick
            WHERE bm.game_id = p_game_id AND bm.is_alive AND bm.is_bot AND bm.role = 'mafia'
        ),
        ballots AS MATERIALIZED (
            SELECT target_player_id AS tid
            FROM public.night_actions
            WHERE game_id = p_game_id AND round_number = v_game.round_number AND role = 'mafia'
            UNION ALL
            SELECT tid FROM bot_kills
        )
        SELECT tid INTO v_kill_target
        FROM ballots
        WHERE tid IS NOT NULL
        GROUP BY tid
        ORDER BY count(*) DESC, random()
        LIMIT 1;

        -- Doctor save: human doctor action, else a living bot doctor auto-picks.
        SELECT target_player_id INTO v_save_target
          FROM public.night_actions
         WHERE game_id = p_game_id AND round_number = v_game.round_number AND role = 'doctor'
         LIMIT 1;
        IF v_save_target IS NULL
           AND EXISTS (SELECT 1 FROM public.game_players
                        WHERE game_id = p_game_id AND role = 'doctor' AND is_alive AND is_bot) THEN
            SELECT id INTO v_save_target
              FROM public.game_players
             WHERE game_id = p_game_id AND is_alive
             ORDER BY random() LIMIT 1;
        END IF;

        -- Apply the kill unless the doctor saved that exact seat.
        IF v_kill_target IS NOT NULL
           AND (v_save_target IS NULL OR v_save_target <> v_kill_target) THEN
            UPDATE public.game_players
               SET is_alive = false, death_round = v_game.round_number,
                   death_phase = 'night', death_reason = 'killed'
             WHERE id = v_kill_target;
            v_died := v_kill_target;
        ELSE
            v_saved := (v_kill_target IS NOT NULL AND v_save_target = v_kill_target);
        END IF;

        INSERT INTO public.game_events (game_id, event_type, payload)
        VALUES (p_game_id, 'night_result', jsonb_build_object(
            'round', v_game.round_number,
            'killed_player_id', v_died,
            'saved', v_saved,
            'role', CASE WHEN v_reveal AND v_died IS NOT NULL
                         THEN (SELECT role FROM public.game_players WHERE id = v_died)
                         ELSE NULL END
        ));

        SELECT count(*) FILTER (WHERE role = 'mafia' AND is_alive),
               count(*) FILTER (WHERE role <> 'mafia' AND is_alive)
          INTO v_mafia_alive, v_town_alive
          FROM public.game_players WHERE game_id = p_game_id;
        IF v_mafia_alive = 0 THEN
            v_winner := 'town';
        ELSIF v_mafia_alive >= v_town_alive THEN
            v_winner := 'mafia';
        END IF;

        IF v_winner IS NOT NULL THEN
            v_new_phase := 'game_over';
        ELSE
            v_new_phase := 'dawn';
            v_new_deadline := now() + make_interval(secs => 8);
        END IF;

    ELSIF v_game.phase = 'dawn' THEN
        v_new_phase := 'day_discussion';
        v_new_deadline := now() + make_interval(secs => v_disc_dur);
        v_event := 'discussion_started';

    ELSIF v_game.phase = 'day_discussion' THEN
        v_new_phase := 'day_voting';
        v_new_deadline := now() + make_interval(secs => v_vote_dur);
        v_event := 'voting_started';

    ELSIF v_game.phase = 'day_voting' THEN
        -- Tally human votes + virtual bot votes. Plurality wins; a tie for the top
        -- count or a skip count >= the top count means no elimination.
        WITH bot_votes AS MATERIALIZED (
            SELECT pick.tid
            FROM public.game_players b
            CROSS JOIN LATERAL (
                SELECT gp2.id AS tid
                FROM public.game_players gp2
                WHERE gp2.game_id = p_game_id AND gp2.is_alive AND gp2.id <> b.id
                  AND (b.role <> 'mafia' OR gp2.role <> 'mafia')
                ORDER BY random() LIMIT 1
            ) pick
            WHERE b.game_id = p_game_id AND b.is_alive AND b.is_bot
        ),
        ballots AS MATERIALIZED (
            SELECT target_player_id AS tid
            FROM public.votes
            WHERE game_id = p_game_id AND round_number = v_game.round_number
            UNION ALL
            SELECT tid FROM bot_votes
        ),
        tally AS (
            SELECT tid, count(*) AS c FROM ballots WHERE tid IS NOT NULL GROUP BY tid
        ),
        maxc AS (SELECT max(c) AS mc FROM tally)
        SELECT CASE
                   WHEN (SELECT mc FROM maxc) IS NULL THEN NULL
                   WHEN (SELECT count(*) FROM tally, maxc WHERE tally.c = maxc.mc) > 1 THEN NULL
                   WHEN (SELECT count(*) FROM ballots WHERE tid IS NULL) >= (SELECT mc FROM maxc) THEN NULL
                   ELSE (SELECT tid FROM tally, maxc WHERE tally.c = maxc.mc ORDER BY random() LIMIT 1)
               END
          INTO v_elim_target;

        IF v_elim_target IS NOT NULL THEN
            UPDATE public.game_players
               SET is_alive = false, death_round = v_game.round_number,
                   death_phase = 'day_voting', death_reason = 'voted_out'
             WHERE id = v_elim_target;
        END IF;

        INSERT INTO public.game_events (game_id, event_type, payload)
        VALUES (p_game_id, 'vote_result', jsonb_build_object(
            'round', v_game.round_number,
            'eliminated_player_id', v_elim_target,
            'role', CASE WHEN v_reveal AND v_elim_target IS NOT NULL
                         THEN (SELECT role FROM public.game_players WHERE id = v_elim_target)
                         ELSE NULL END
        ));

        SELECT count(*) FILTER (WHERE role = 'mafia' AND is_alive),
               count(*) FILTER (WHERE role <> 'mafia' AND is_alive)
          INTO v_mafia_alive, v_town_alive
          FROM public.game_players WHERE game_id = p_game_id;
        IF v_mafia_alive = 0 THEN
            v_winner := 'town';
        ELSIF v_mafia_alive >= v_town_alive THEN
            v_winner := 'mafia';
        END IF;

        IF v_winner IS NOT NULL THEN
            v_new_phase := 'game_over';
        ELSE
            v_new_phase := 'result';
            v_new_deadline := now() + make_interval(secs => 8);
        END IF;

    ELSIF v_game.phase = 'result' THEN
        -- The morning-after summary; loop back into a fresh night.
        v_new_phase := 'night';
        v_new_round := v_game.round_number + 1;
        v_new_deadline := now() + make_interval(secs => v_night_dur);
        v_event := 'night_started';
    END IF;

    -- ------------------------------------------------------------------
    -- Commit the transition.
    -- ------------------------------------------------------------------
    UPDATE public.games
       SET phase = v_new_phase,
           round_number = COALESCE(v_new_round, round_number),
           phase_deadline = CASE WHEN v_new_phase = 'game_over' THEN NULL ELSE v_new_deadline END,
           winner = COALESCE(v_winner, winner),
           updated_at = now()
     WHERE id = p_game_id
    RETURNING * INTO v_game;

    IF v_new_phase = 'game_over' THEN
        UPDATE public.rooms SET status = 'completed' WHERE id = v_game.room_id;
        INSERT INTO public.game_events (game_id, event_type, payload)
        VALUES (p_game_id, 'game_over', jsonb_build_object('winner', v_game.winner));
    ELSIF v_event IS NOT NULL THEN
        INSERT INTO public.game_events (game_id, event_type, payload)
        VALUES (p_game_id, v_event, jsonb_build_object(
            'round', v_game.round_number, 'phase', v_new_phase));
    END IF;

    RETURN v_game;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_game_phase(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.advance_game_phase(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. get_investigation_result — private detective result (boolean: is target mafia?)
-- Only the detective who recorded a night_action that round may read it, so the
-- result never has to travel through a broadcast game_event.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_investigation_result(p_game_id uuid, p_round_number int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_target uuid;
    v_is_mafia boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT target_player_id INTO v_target
      FROM public.night_actions
     WHERE game_id = p_game_id AND round_number = p_round_number
       AND actor_id = v_uid AND role = 'detective';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no_investigation';
    END IF;

    SELECT (role = 'mafia') INTO v_is_mafia
      FROM public.game_players WHERE id = v_target;

    RETURN COALESCE(v_is_mafia, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_investigation_result(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_investigation_result(uuid, int) TO authenticated;

-- =============================================================================
-- End of game engine migration
-- =============================================================================












