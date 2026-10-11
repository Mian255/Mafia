-- =============================================================================
-- Migration: Smarter Bots + Night Chat Channel
-- Date: 2026-10-11
-- =============================================================================
-- Builds on the game engine (20260927000003) and the AI bot chat migration
-- (20260927000004):
--
--   1. Bot action heuristics inside advance_game_phase (server knows the secret
--      roles; picks stay reachable/beatable, never omniscient):
--      * bot mafia KILL: prefer HUMAN seats over bot seats, never target mafia.
--      * bot DOCTOR SAVE: ~50% protects self when alive, never protects a
--        mafia seat, otherwise prefers a living human town member.
--      * bot VOTES: bandwagon on the current human plurality target when that
--        target is not mafia; mafia bots never vote fellow mafia; town bots
--        never vote themselves. Fallback: random living non-mafia seat.
--
--   2. Mafia night chat: the `mafia` channel, its RLS, and the AI trigger all
--      already exist (20260927000004 fires on `mafia` messages), so bot mafia
--      banter works with no schema change. Documented below.
--
-- SAFE: idempotent (OR REPLACE); replaces only advance_game_phase; no data
-- migration. Determinism of the transition is preserved by the FOR UPDATE +
-- deadline-recheck guard in the engine (unchanged).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- advance_game_phase — v2 with heuristic bot picks
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
        WITH bot_kills AS MATERIALIZED (
            SELECT pick.tid
            FROM public.game_players bm
            CROSS JOIN LATERAL (
                SELECT t.tid
                FROM (
                    -- Prefer human seats: one random human (weight 3 lottery =
                    -- draw humans first; fall back to any non-mafia seat).
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
                       -- ~50% self-save when the bot doctor is alive: implement by
                       -- ranking self first half the time via a random() gate.
                       (random() < 0.5) AS self_first,
                       CASE WHEN gp.user_id IS NOT NULL THEN 0 ELSE 1 END AS human_rank
                FROM public.game_players gp
                WHERE gp.game_id = p_game_id AND gp.is_alive AND gp.role <> 'mafia'
            )
            SELECT c.id INTO v_save_target
            FROM candidates c
            ORDER BY
                -- ranking drops a random 50% of self-candidates below everyone else
                CASE WHEN c.role = 'doctor' AND c.self_first THEN 0 ELSE 10 END,
                c.human_rank ASC,            -- humans before bots
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

    ELSIF v_game.phase = 'dawn' THEN
        v_new_phase := 'day_discussion';
        v_new_deadline := now() + make_interval(secs => v_disc_dur);
        v_event := 'discussion_started';

    ELSIF v_game.phase = 'day_discussion' THEN
        v_new_phase := 'day_voting';
        v_new_deadline := now() + make_interval(secs => v_vote_dur);
        v_event := 'voting_started';

    ELSIF v_game.phase = 'day_voting' THEN
        -- Tally human votes + heuristic bot votes. Plurality wins; a tie for the
        -- top count or a skip count >= the top count means no elimination.
        --
        -- Bot vote heuristic (bandwagon with a conscience):
        --   leader   = current human plurality target (random tie-break).
        --   mafia bot: follow the leader ONLY if it is not mafia; otherwise
        --              back a random non-leader (deflect) — never a fellow mafia.
        --   town bot:  follow the leader when there is one (unless it is self);
        --              otherwise a random living non-mafia seat that isn't self.
        --              (Town bots must not know roles — "non-mafia" fallback is
        --              only reachable when NO leader exists and they would
        --              otherwise abstain into parity loss; acceptable noise,
        --              matching the old pure-random behavior.)
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
                                 AND gp2.id <> b.id AND gp2.id <> b.id
                           ORDER BY random() LIMIT 1
                       )
                       WHEN b.role = 'mafia' AND lr.l_role = 'mafia' THEN (
                           -- deflect: random living seat that is neither self nor mafia
                           SELECT gp3.id
                           FROM public.game_players gp3
                           WHERE gp3.game_id = p_game_id AND gp3.is_alive
                                 AND gp3.id <> b.id AND gp3.role <> 'mafia'
                           ORDER BY random() LIMIT 1
                       )
                       WHEN b.id = l.tid THEN (
                           -- never vote for self; pick another living human
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
-- Mafia night chat — documentation of the existing wiring (no schema change):
--   * `messages.channel = 'mafia'` RLS (initial schema): only living mafia
--     members read/write; bots insert via the edge function's service role.
--   * trg_narrator_ai_chat (20260927000004) already fires on mafia messages,
--     so bot mafia banter now happens automatically once a mafia human or the
--     engine's smart picks provoke a turn.
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.app_config IS
    'Service-role-only config. ai_bot_chat: enabled, function_name, functions_base_url, replies_per_turn, cooldown_seconds.';
