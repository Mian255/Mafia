-- =============================================================================
-- Migration: Sequential Night Turns (mafia -> doctor -> detective)
-- Date: 2026-10-11
-- =============================================================================
-- Turns the single simultaneous 'night' phase into an ordered sequence of role
-- turns, like tabletop Mafia: the narrator wakes the mafia, then the doctor,
-- then the detective, each acting only during their own stage before the night
-- resolves at dawn.
--
--   1. games.night_stage text  (NULL outside night; 'mafia' | 'doctor' |
--      'detective' during night). Drives the UI gate + the realtime narration.
--   2. next_night_stage(): pure helper returning the next stage among the roles
--      that are still ALIVE this game, or NULL after the last one.
--   3. submit_night_action: only the seat whose role == current night_stage may
--      act; anyone else gets 'not_your_turn'.
--   4. advance_game_phase (rebuilt on the heuristic body of 20261011000001, so
--      smart bot picks are preserved): during 'night' it now STEPS to the next
--      stage each tick (per-stage deadline, or early once every living human of
--      that stage has acted) and only runs the kill/save RESOLUTION after the
--      final stage. Entering night (from role_reveal and result) seeds
--      night_stage='mafia'; the night->dawn transition clears it to NULL.
--
-- SAFE: idempotent. Existing in-flight night games have night_stage NULL, which
-- COALESCE(...) treats as 'mafia', so they continue correctly after deploy.
-- =============================================================================

-- 1. games.night_stage column + constraint.
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS night_stage text;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_night_stage_check;
ALTER TABLE public.games
    ADD CONSTRAINT games_night_stage_check
    CHECK (night_stage IS NULL OR night_stage IN ('mafia', 'doctor', 'detective'));

-- 2. next_night_stage — ordered mafia -> doctor -> detective, skipping roles
--    with no living seat. Mafia always opens (a game cannot have zero mafia and
--    still be in night). STABLE + owner-only (called from the definer function).
CREATE OR REPLACE FUNCTION public.next_night_stage(p_game_id uuid, p_current text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE p_current
        WHEN 'mafia' THEN
            CASE WHEN EXISTS (SELECT 1 FROM public.game_players
                               WHERE game_id = p_game_id AND is_alive AND role = 'doctor')
                 THEN 'doctor'
                 WHEN EXISTS (SELECT 1 FROM public.game_players
                               WHERE game_id = p_game_id AND is_alive AND role = 'detective')
                 THEN 'detective'
                 ELSE NULL END
        WHEN 'doctor' THEN
            CASE WHEN EXISTS (SELECT 1 FROM public.game_players
                               WHERE game_id = p_game_id AND is_alive AND role = 'detective')
                 THEN 'detective'
                 ELSE NULL END
        ELSE NULL
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_night_stage(uuid, text) FROM public;

-- 3. submit_night_action — enforce "only the waking role acts".
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

    -- Sequential turn gate: only the role the narrator has woken may act now.
    IF COALESCE(v_game.night_stage, 'mafia') <> v_actor.role THEN
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

-- 4. advance_game_phase — staged night. Replaces the heuristic version from
--    20261011000001; the smart bot kill/save/vote logic is carried over intact,
--    only the night phase is broken into ordered role turns.
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
    v_new_stage text := NULL;
    v_stage text;
    v_next text;
    v_stages int;
    v_stage_dur int;
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

    -- Per-stage slice of the configured night window, split across the roles
    -- that are actually awake this game (mafia always; doctor/detective if a
    -- living seat holds them). Floor of 10s so a stage is never skipped too fast.
    SELECT 1
        + (CASE WHEN EXISTS (SELECT 1 FROM public.game_players
                              WHERE game_id = p_game_id AND is_alive AND role = 'doctor')
                THEN 1 ELSE 0 END)
        + (CASE WHEN EXISTS (SELECT 1 FROM public.game_players
                              WHERE game_id = p_game_id AND is_alive AND role = 'detective')
                THEN 1 ELSE 0 END)
      INTO v_stages;
    v_stage_dur := GREATEST(10, v_night_dur / v_stages);

    -- Deadline gate.
    v_can_advance := (v_game.phase_deadline IS NOT NULL AND now() >= v_game.phase_deadline);

    IF v_game.phase = 'night' THEN
        -- Early-advance only the CURRENT stage once every living human of that
        -- role has acted (not the whole night).
        v_stage := COALESCE(v_game.night_stage, 'mafia');
        SELECT count(*) INTO v_expected
          FROM public.game_players
         WHERE game_id = p_game_id AND is_alive AND user_id IS NOT NULL
           AND role = v_stage;
        SELECT count(*) INTO v_acted
          FROM public.night_actions
         WHERE game_id = p_game_id AND round_number = v_game.round_number AND role = v_stage;
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
        RETURN v_game;  -- deadline not reached and not all humans of the active step acted.
    END IF;

    -- ------------------------------------------------------------------
    -- Phase transition.
    -- ------------------------------------------------------------------
    IF v_game.phase = 'role_reveal' THEN
        v_new_phase := 'night';
        v_new_stage := 'mafia';
        v_new_deadline := now() + make_interval(secs => v_stage_dur);
        v_event := 'night_started';

    ELSIF v_game.phase = 'night' THEN
        v_stage := COALESCE(v_game.night_stage, 'mafia');
        v_next := public.next_night_stage(p_game_id, v_stage);

        IF v_next IS NOT NULL THEN
            -- Step to the next role's turn; do NOT resolve the night yet.
            v_new_phase := 'night';
            v_new_stage := v_next;
            v_new_deadline := now() + make_interval(secs => v_stage_dur);
            v_event := NULL;
        ELSE
            -- Final stage complete: resolve the night.
            -- Mafia kill target: plurality of {human mafia actions} + {bot mafia picks}.
            WITH bot_kills AS MATERIALIZED (
                SELECT pick.tid
                FROM public.game_players bm
                CROSS JOIN LATERAL (
                    SELECT t.tid
                    FROM (
                        SELECT gp.id AS tid
                        FROM public.game_players gp
                        WHERE gp.game_id = p_game_id AND gp.is_alive
                              AND gp.role <> 'mafia' AND gp.user_id IS NOT NULL
                        ORDER BY random() LIMIT 1
                        UNION ALL
                        SELECT gp.id
                        FROM public.game_players gp
                        WHERE gp.game_id = p_game_id AND gp.is_alive
                              AND gp.role <> 'mafia' AND gp.user_id IS NULL
                        ORDER BY random() LIMIT 1
                    ) t
                    LIMIT 1
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

            -- Doctor save: human doctor action, else a 'smart' bot doctor pick.
            SELECT target_player_id INTO v_save_target
              FROM public.night_actions
             WHERE game_id = p_game_id AND round_number = v_game.round_number AND role = 'doctor'
             LIMIT 1;
            IF v_save_target IS NULL
               AND EXISTS (SELECT 1 FROM public.game_players
                            WHERE game_id = p_game_id AND role = 'doctor' AND is_alive AND is_bot) THEN
                WITH candidates AS MATERIALIZED (
                    SELECT gp.id,
                           gp.user_id,
                           gp.role,
                           (random() < 0.5) AS self_first,
                           CASE WHEN gp.user_id IS NOT NULL THEN 0 ELSE 1 END AS human_rank
                    FROM public.game_players gp
                    WHERE gp.game_id = p_game_id AND gp.is_alive AND gp.role <> 'mafia'
                )
                SELECT c.id INTO v_save_target
                FROM candidates c
                ORDER BY
                    CASE WHEN c.role = 'doctor' AND c.self_first THEN 0 ELSE 10 END,
                    c.human_rank ASC,
                    random()
                LIMIT 1;
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
            v_new_stage := NULL;
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
        WITH bot_seats AS MATERIALIZED (
            SELECT b.id, b.role
            FROM public.game_players b
            WHERE b.game_id = p_game_id AND b.is_alive AND b.is_bot
        ),
        human_tally AS MATERIALIZED (
            SELECT v.target_player_id AS tid, count(*) AS c
            FROM public.votes v
            WHERE v.game_id = p_game_id AND v.round_number = v_game.round_number
              AND v.target_player_id IS NOT NULL
            GROUP BY v.target_player_id
        ),
        leader AS MATERIALIZED (
            SELECT tid FROM human_tally ORDER BY c DESC, random() LIMIT 1
        ),
        leader_role AS MATERIALIZED (
            SELECT gp.role AS l_role
            FROM leader l JOIN public.game_players gp ON gp.id = l.tid
        ),
        bot_votes AS MATERIALIZED (
            SELECT b.id AS voter_seat_id,
                   CASE
                       WHEN l.tid IS NULL THEN (
                           SELECT gp2.id
                           FROM public.game_players gp2
                           WHERE gp2.game_id = p_game_id AND gp2.is_alive
                                 AND gp2.id <> b.id
                           ORDER BY random() LIMIT 1
                       )
                       WHEN b.role = 'mafia' AND lr.l_role = 'mafia' THEN (
                           SELECT gp3.id
                           FROM public.game_players gp3
                           WHERE gp3.game_id = p_game_id AND gp3.is_alive
                                 AND gp3.id <> b.id AND gp3.role <> 'mafia'
                           ORDER BY random() LIMIT 1
                       )
                       WHEN b.id = l.tid THEN (
                           SELECT gp4.id
                           FROM public.game_players gp4
                           WHERE gp4.game_id = p_game_id AND gp4.is_alive
                                 AND gp4.id <> b.id
                           ORDER BY random() LIMIT 1
                       )
                       ELSE l.tid
                   END AS tid
            FROM bot_seats b
            CROSS JOIN leader l
            CROSS JOIN leader_role lr
        ),
        ballots AS MATERIALIZED (
            SELECT target_player_id AS tid
            FROM public.votes
            WHERE game_id = p_game_id AND round_number = v_game.round_number
            UNION ALL
            SELECT tid FROM bot_votes WHERE tid IS NOT NULL
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
        v_new_phase := 'night';
        v_new_round := v_game.round_number + 1;
        v_new_stage := 'mafia';
        v_new_deadline := now() + make_interval(secs => v_stage_dur);
        v_event := 'night_started';
    END IF;

    -- ------------------------------------------------------------------
    -- Commit the transition.
    -- ------------------------------------------------------------------
    UPDATE public.games
       SET phase = v_new_phase,
           round_number = COALESCE(v_new_round, round_number),
           night_stage = v_new_stage,
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
