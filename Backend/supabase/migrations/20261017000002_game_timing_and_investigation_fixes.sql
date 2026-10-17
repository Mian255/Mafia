-- =============================================================================
-- Migration: Game Timing, Generous Turn Durations & Enhanced Investigation RPC
-- Date: 2026-10-17
-- =============================================================================
-- 1. Ensure sequential night turn duration is at least 25 seconds per stage
--    (never rushing players or ending instantly).
-- 2. Enhanced get_investigation_result RPC returning rich investigation data
--    (target name, is_mafia, round) immediately after detective submission.
-- 3. Room settings sensible minimums for night and voting durations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Update advance_game_phase with generous stage duration (at least 25s)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_game_phase(p_game_id uuid)
RETURNS public.games
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game public.games;
    v_settings public.room_settings;
    v_night_dur int;
    v_disc_dur int;
    v_vote_dur int;
    v_stages int := 1;
    v_stage_dur int;
    v_can_advance boolean := false;
    v_new_phase text;
    v_new_stage text := NULL;
    v_new_deadline timestamptz;
    v_event text := NULL;
    v_payload jsonb := '{}'::jsonb;
    v_stage text;
    v_expected int;
    v_acted int;
    v_next text;
    v_kill_target uuid;
    v_save_target uuid;
    v_elim_seat uuid;
    v_victim_user_id uuid;
    v_victim_role text;
    v_living_town int;
    v_living_mafia int;
    v_winner text := NULL;
BEGIN
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game_not_found';
    END IF;
    IF v_game.phase = 'game_over' THEN
        RETURN v_game;
    END IF;

    SELECT * INTO v_settings FROM public.room_settings WHERE room_id = v_game.room_id;
    v_night_dur := COALESCE(v_settings.night_duration_seconds, 35);
    v_disc_dur := COALESCE(v_settings.discussion_duration_seconds, 90);
    v_vote_dur := COALESCE(v_settings.voting_duration_seconds, 35);

    -- Each night turn gets at least 25 seconds (or full night_dur / stages if higher)
    SELECT 1
        + (CASE WHEN EXISTS (SELECT 1 FROM public.game_players
                              WHERE game_id = p_game_id AND is_alive AND role = 'doctor')
                THEN 1 ELSE 0 END)
        + (CASE WHEN EXISTS (SELECT 1 FROM public.game_players
                              WHERE game_id = p_game_id AND is_alive AND role = 'detective')
                THEN 1 ELSE 0 END)
      INTO v_stages;
    v_stage_dur := GREATEST(25, v_night_dur / GREATEST(1, v_stages));

    -- Deadline gate
    v_can_advance := (v_game.phase_deadline IS NOT NULL AND now() >= v_game.phase_deadline);

    IF v_game.phase = 'night' THEN
        v_stage := COALESCE(v_game.night_stage, 'mafia');
        SELECT count(*) INTO v_expected
          FROM public.game_players
         WHERE game_id = p_game_id AND is_alive AND user_id IS NOT NULL
           AND role = v_stage;
        SELECT count(*) INTO v_acted
          FROM public.night_actions
         WHERE game_id = p_game_id AND round_number = v_game.round_number AND role = v_stage;

        -- If humans exist and all acted, can advance; if only bots, advance once deadline reached or after a 4s grace
        IF v_expected > 0 AND v_acted >= v_expected THEN
            v_can_advance := true;
        ELSIF v_expected = 0 THEN
            -- Only bot(s) in this stage: allow at least 6s of simulation before advancing
            IF v_game.phase_deadline IS NOT NULL AND (now() >= v_game.phase_deadline - make_interval(secs => (v_stage_dur - 6))) THEN
                v_can_advance := true;
            END IF;
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
        RETURN v_game;
    END IF;

    -- Phase transitions
    IF v_game.phase = 'role_reveal' THEN
        v_new_phase := 'night';
        v_new_stage := 'mafia';
        v_new_deadline := now() + make_interval(secs => v_stage_dur);
        v_event := 'night_started';

    ELSIF v_game.phase = 'night' THEN
        v_stage := COALESCE(v_game.night_stage, 'mafia');
        v_next := public.next_night_stage(p_game_id, v_stage);

        IF v_next IS NOT NULL THEN
            v_new_phase := 'night';
            v_new_stage := v_next;
            v_new_deadline := now() + make_interval(secs => v_stage_dur);
            v_event := NULL;
        ELSE
            -- Final night stage complete: resolve night actions
            WITH bot_kills AS MATERIALIZED (
                SELECT pick.tid
                FROM public.game_players bm
                CROSS JOIN LATERAL (
                    SELECT t.tid
                    FROM (
                        (
                            SELECT gp.id AS tid
                            FROM public.game_players gp
                            WHERE gp.game_id = p_game_id AND gp.is_alive
                                  AND gp.role <> 'mafia' AND gp.user_id IS NOT NULL
                            ORDER BY random() LIMIT 1
                        )
                        UNION ALL
                        (
                            SELECT gp.id
                            FROM public.game_players gp
                            WHERE gp.game_id = p_game_id AND gp.is_alive
                                  AND gp.role <> 'mafia' AND gp.user_id IS NULL
                            ORDER BY random() LIMIT 1
                        )
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
                SELECT id INTO v_save_target
                FROM candidates
                ORDER BY human_rank ASC, random()
                LIMIT 1;
            END IF;

            IF v_kill_target IS NOT NULL AND v_kill_target IS DISTINCT FROM v_save_target THEN
                SELECT user_id, role INTO v_victim_user_id, v_victim_role
                  FROM public.game_players WHERE id = v_kill_target;

                UPDATE public.game_players
                   SET is_alive = false,
                       death_round = v_game.round_number,
                       death_phase = 'night',
                       death_reason = 'Killed by the Mafia'
                 WHERE id = v_kill_target;

                v_payload := jsonb_build_object(
                    'round', v_game.round_number,
                    'killed_player_id', v_kill_target,
                    'saved', false,
                    'role', v_victim_role
                );
            ELSE
                v_payload := jsonb_build_object(
                    'round', v_game.round_number,
                    'killed_player_id', NULL,
                    'saved', (v_kill_target IS NOT NULL AND v_kill_target = v_save_target),
                    'role', NULL
                );
            END IF;

            SELECT count(*) INTO v_living_town
              FROM public.game_players
             WHERE game_id = p_game_id AND is_alive AND role <> 'mafia';
            SELECT count(*) INTO v_living_mafia
              FROM public.game_players
             WHERE game_id = p_game_id AND is_alive AND role = 'mafia';

            IF v_living_mafia = 0 THEN
                v_winner := 'town';
            ELSIF v_living_mafia >= v_living_town THEN
                v_winner := 'mafia';
            END IF;

            IF v_winner IS NOT NULL THEN
                v_new_phase := 'game_over';
                v_new_deadline := NULL;
                v_event := 'game_over';
                v_payload := v_payload || jsonb_build_object('winner', v_winner);
            ELSE
                v_new_phase := 'dawn';
                v_new_deadline := now() + make_interval(secs => 7);
                v_event := 'dawn_result';
            END IF;
            v_new_stage := NULL;
        END IF;

    ELSIF v_game.phase = 'dawn' THEN
        v_new_phase := 'day_discussion';
        v_new_stage := NULL;
        v_new_deadline := now() + make_interval(secs => v_disc_dur);
        v_event := 'discussion_started';

    ELSIF v_game.phase = 'day_discussion' THEN
        v_new_phase := 'day_voting';
        v_new_stage := NULL;
        v_new_deadline := now() + make_interval(secs => v_vote_dur);
        v_event := 'voting_started';

    ELSIF v_game.phase = 'day_voting' THEN
        -- Resolve voting
        WITH bot_ballots AS MATERIALIZED (
            SELECT bv.id AS voter_id,
                   pick.target_id
            FROM public.game_players bv
            CROSS JOIN LATERAL (
                SELECT gp.id AS target_id
                FROM public.game_players gp
                WHERE gp.game_id = p_game_id AND gp.is_alive AND gp.id <> bv.id
                ORDER BY
                    CASE
                        WHEN bv.role = 'mafia' AND gp.role = 'mafia' THEN 2
                        WHEN bv.role = 'mafia' AND gp.user_id IS NOT NULL THEN 0
                        ELSE 1
                    END ASC,
                    random()
                LIMIT 1
            ) pick
            WHERE bv.game_id = p_game_id AND bv.is_alive AND bv.is_bot
        ),
        all_votes AS MATERIALIZED (
            SELECT target_player_id AS target_id
            FROM (
                SELECT (SELECT gp.id FROM public.game_players gp
                         WHERE gp.game_id = v_game.id AND gp.user_id = v.target_id
                         LIMIT 1) AS target_player_id
                FROM public.votes v
                WHERE v.game_id = p_game_id AND v.round_number = v_game.round_number AND v.target_id IS NOT NULL
                UNION ALL
                SELECT target_id FROM bot_ballots WHERE target_id IS NOT NULL
            ) u
        ),
        tally AS (
            SELECT target_id, count(*) AS cnt
            FROM all_votes
            WHERE target_id IS NOT NULL
            GROUP BY target_id
        ),
        ranked AS (
            SELECT target_id, cnt, rank() OVER (ORDER BY cnt DESC) AS rnk
            FROM tally
        )
        SELECT target_id INTO v_elim_seat
        FROM ranked
        WHERE rnk = 1
          AND (SELECT count(*) FROM ranked WHERE rnk = 1) = 1;

        IF v_elim_seat IS NOT NULL THEN
            SELECT user_id, role INTO v_victim_user_id, v_victim_role
              FROM public.game_players WHERE id = v_elim_seat;

            UPDATE public.game_players
               SET is_alive = false,
                   death_round = v_game.round_number,
                   death_phase = 'day_voting',
                   death_reason = 'Eliminated by town vote'
             WHERE id = v_elim_seat;

            v_payload := jsonb_build_object(
                'round', v_game.round_number,
                'eliminated_player_id', v_elim_seat,
                'role', v_victim_role
            );
        ELSE
            v_payload := jsonb_build_object(
                'round', v_game.round_number,
                'eliminated_player_id', NULL,
                'role', NULL
            );
        END IF;

        SELECT count(*) INTO v_living_town
          FROM public.game_players
         WHERE game_id = p_game_id AND is_alive AND role <> 'mafia';
        SELECT count(*) INTO v_living_mafia
          FROM public.game_players
         WHERE game_id = p_game_id AND is_alive AND role = 'mafia';

        IF v_living_mafia = 0 THEN
            v_winner := 'town';
        ELSIF v_living_mafia >= v_living_town THEN
            v_winner := 'mafia';
        END IF;

        IF v_winner IS NOT NULL THEN
            v_new_phase := 'game_over';
            v_new_deadline := NULL;
            v_event := 'game_over';
            v_payload := v_payload || jsonb_build_object('winner', v_winner);
        ELSE
            v_new_phase := 'result';
            v_new_deadline := now() + make_interval(secs => 7);
            v_event := 'vote_result';
        END IF;
        v_new_stage := NULL;

    ELSIF v_game.phase = 'result' THEN
        v_new_phase := 'night';
        v_new_stage := 'mafia';
        v_new_deadline := now() + make_interval(secs => v_stage_dur);
        v_event := 'night_started';
        UPDATE public.games SET round_number = round_number + 1 WHERE id = p_game_id;
    END IF;

    UPDATE public.games
       SET phase = v_new_phase,
           night_stage = v_new_stage,
           phase_deadline = v_new_deadline,
           winner = COALESCE(v_winner, winner),
           updated_at = now()
     WHERE id = p_game_id
    RETURNING * INTO v_game;

    IF v_event IS NOT NULL THEN
        INSERT INTO public.game_events (game_id, event_type, payload)
        VALUES (p_game_id, v_event, v_payload);
    END IF;

    RETURN v_game;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Enhanced get_investigation_result returning rich jsonb result immediately
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_investigation_result(p_game_id uuid, p_round_number int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_target uuid;
    v_target_name text;
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
        RETURN NULL;
    END IF;

    SELECT (role = 'mafia'),
           COALESCE(bot_name, (SELECT username FROM public.profiles WHERE id = user_id), 'Player')
      INTO v_is_mafia, v_target_name
      FROM public.game_players WHERE id = v_target;

    RETURN jsonb_build_object(
        'is_mafia', COALESCE(v_is_mafia, false),
        'target_id', v_target,
        'target_name', v_target_name,
        'round', p_round_number
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_investigation_result(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_investigation_result(uuid, int) TO authenticated;
