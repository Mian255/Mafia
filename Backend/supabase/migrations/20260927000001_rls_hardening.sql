-- =============================================================================
-- Migration: RLS Hardening & Security Fixes
-- Date: 2026-09-27
-- Fixes confirmed P0/security issues in RLS policies, adds an atomic join RPC,
-- hardens SECURITY DEFINER search_path, and adds hot-path indexes.
-- All statements are idempotent (IF EXISTS / OR REPLACE / IF NOT EXISTS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ISSUE 1 (P0): game_players role leak
-- Two OR-combined permissive SELECT policies let any participant read every
-- player's `role`. Drop the broad `is_game_participant` SELECT policy so the
-- base table only ever exposes: the caller's own row, fellow-mafia rows (if the
-- caller is mafia), or all rows once the game is over. Non-mafia roster /
-- living-status reads must go through the SECURITY DEFINER view
-- `public.game_players_view` (below), which returns the full roster but masks
-- `role` (NULL) unless the caller is that player, a fellow mafia, or the game is
-- over. RLS is row-level (not column-level), so the column masking lives in the
-- view. HARD REQUIREMENT met: a non-mafia player cannot read another player's
-- role before game over.
-- -----------------------------------------------------------------------------

-- Drop the broad policy that leaked all rows (incl. role) to any participant.
DROP POLICY IF EXISTS "Players can view living status of all players in their game" ON public.game_players;

-- Keep the restrictive row policy: own row, fellow-mafia rows, or post-game.
DROP POLICY IF EXISTS "Players can only view their own role or fellow mafia" ON public.game_players;
CREATE POLICY "Players can only view their own role or fellow mafia"
    ON public.game_players FOR SELECT
    USING (
        auth.uid() = user_id
        OR (role = 'mafia' AND public.is_mafia_player(game_id, auth.uid()))
        OR public.is_game_over(game_id)
    );

-- SECURITY DEFINER view for the roster use case (who is in the game / alive).
-- security_invoker = false => runs as the view owner and bypasses base-table
-- RLS, so participants see the full roster while `role` stays masked for
-- non-self / non-mafia until game over. auth.uid() still resolves per request.
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
        gp.death_round,
        gp.death_phase,
        gp.death_reason,
        gp.created_at
    FROM public.game_players gp
    WHERE public.is_game_participant(gp.game_id, auth.uid());

REVOKE ALL ON public.game_players_view FROM anon;
GRANT SELECT ON public.game_players_view TO authenticated;

-- -----------------------------------------------------------------------------
-- ISSUE 2 (P0): night_actions forgery
-- INSERT only checked auth.uid() = actor_id, so a dead player or non-participant
-- could forge actions. Require the actor to be a LIVING game_players row for the
-- target game. (Role/phase correctness is enforced by the SECURITY DEFINER RPCs
-- added by another agent; RLS just blocks dead / non-participant inserts.)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Actors can insert their night action" ON public.night_actions;
CREATE POLICY "Actors can insert their night action"
    ON public.night_actions FOR INSERT
    WITH CHECK (
        auth.uid() = actor_id
        AND EXISTS (
            SELECT 1 FROM public.game_players
            WHERE game_id = night_actions.game_id
              AND user_id = auth.uid()
              AND is_alive = true
        )
    );

-- -----------------------------------------------------------------------------
-- ISSUE 3 (P0): profiles email exposure
-- `email` was world-readable. RLS is row-level, so we use COLUMN-level privileges
-- to hide email while keeping username/avatar searchable. The row-level SELECT
-- policy ("Profiles are viewable by everyone") is intentionally left in place.
-- (Login email resolution is handled by a separate get_email_for_username RPC
-- added by another agent; SECURITY DEFINER RPCs bypass these column grants.)
-- -----------------------------------------------------------------------------
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, avatar_url, created_at, updated_at) ON public.profiles TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- ISSUE 4: rooms private-room read
-- SELECT was USING(true), exposing private rooms to everyone. Restrict to public
-- rooms, the host, or current members. (Joining a private room by code still
-- works via join_room_atomic below, which is SECURITY DEFINER and bypasses RLS.)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON public.rooms;
DROP POLICY IF EXISTS "Rooms are viewable by members or public" ON public.rooms;
CREATE POLICY "Rooms are viewable by members or public"
    ON public.rooms FOR SELECT
    USING (
        is_public
        OR host_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.room_players rp
            WHERE rp.room_id = rooms.id AND rp.user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- ISSUE 5: room_players unguarded INSERT / self-host / capacity
-- (a) Atomic join RPC: validates the room exists, is in the lobby, and is not
--     full; idempotent for an already-joined caller. Always joins as a non-host,
--     non-bot player. SECURITY DEFINER so it bypasses RLS (needed to read a
--     private room by code and to count occupants).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_room_atomic(p_room_code text)
RETURNS public.room_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_room public.rooms;
    v_existing public.room_players;
    v_count INT;
    v_new public.room_players;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = p_room_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'room_not_found';
    END IF;

    IF v_room.status <> 'lobby' THEN
        RAISE EXCEPTION 'not_in_lobby';
    END IF;

    -- Idempotent: return existing membership if the caller already joined.
    SELECT * INTO v_existing
    FROM public.room_players
    WHERE room_id = v_room.id AND user_id = v_uid;
    IF FOUND THEN
        RETURN v_existing;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.room_players
    WHERE room_id = v_room.id;

    IF v_count >= v_room.max_players THEN
        RAISE EXCEPTION 'room_full';
    END IF;

    INSERT INTO public.room_players (room_id, user_id, is_host, is_ready, is_bot)
    VALUES (v_room.id, v_uid, false, false, false)
    RETURNING * INTO v_new;

    RETURN v_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_room_atomic(text) FROM public;
GRANT EXECUTE ON FUNCTION public.join_room_atomic(text) TO authenticated;

-- (b) Tighten the raw INSERT: a plain joiner can never self-set is_host = true.
--     ASSUMPTION: the room-creation flow inserts the rooms row (host_id = creator)
--     FIRST, then inserts the host's room_players row; that path is allowed to set
--     is_host = true because it matches rooms.host_id. Hosts may still add bots.
--     Regular players should join via join_room_atomic (above); this policy is the
--     backstop for the host-creation and bot-add paths.
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_players;
CREATE POLICY "Users can join rooms"
    ON public.room_players FOR INSERT
    WITH CHECK (
        -- Host adds a bot to their own room
        (is_bot = true AND EXISTS (
            SELECT 1 FROM public.rooms WHERE id = room_players.room_id AND host_id = auth.uid()
        ))
        -- Room creator inserts themselves as host (creation path only)
        OR (auth.uid() = user_id AND is_bot = false AND is_host = true AND EXISTS (
            SELECT 1 FROM public.rooms WHERE id = room_players.room_id AND host_id = auth.uid()
        ))
        -- Regular human joiner: self only, never as host
        OR (auth.uid() = user_id AND is_bot = false AND is_host = false)
    );

-- -----------------------------------------------------------------------------
-- ISSUE 6: friend_requests self-accept
-- The single UPDATE policy (USING receiver OR sender) let the SENDER flip status
-- to 'accepted'. Split by role via WITH CHECK: the receiver may only move to
-- accepted/declined; the sender may only move to cancelled.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update received requests" ON public.friend_requests;

DROP POLICY IF EXISTS "Receiver can accept or decline requests" ON public.friend_requests;
CREATE POLICY "Receiver can accept or decline requests"
    ON public.friend_requests FOR UPDATE
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id AND status IN ('accepted', 'declined'));

DROP POLICY IF EXISTS "Sender can cancel requests" ON public.friend_requests;
CREATE POLICY "Sender can cancel requests"
    ON public.friend_requests FOR UPDATE
    USING (auth.uid() = sender_id)
    WITH CHECK (auth.uid() = sender_id AND status = 'cancelled');

-- -----------------------------------------------------------------------------
-- ISSUE 7: SECURITY DEFINER search_path hardening
-- Recreate SECURITY DEFINER (and helper) functions that omitted SET search_path.
-- Bodies are preserved verbatim from the schema/migrations; only search_path is
-- added. NOTE: public.delete_user_account references public.friends and
-- public.player_stats, which do not exist in the current schema (pre-existing
-- latent bug); per instructions its logic is left unchanged.
-- -----------------------------------------------------------------------------

-- handle_new_user (latest body: syncs email, ON CONFLICT DO UPDATE)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || SUBSTRING(NEW.id::text, 1, 6)),
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, public.profiles.username),
        email = COALESCE(EXCLUDED.email, public.profiles.email);
    RETURN NEW;
END;
$$;

-- handle_new_user_stats
CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_stats (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- generate_room_code (add search_path; logic unchanged)
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..5 LOOP
        result := result || SUBSTRING(chars FROM FLOOR(RANDOM() * LENGTH(chars) + 1)::INT FOR 1);
    END LOOP;
    RETURN result;
END;
$$;

-- delete_user_account (add search_path; body preserved verbatim, see NOTE above)
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Clean up related application data
    DELETE FROM public.friends WHERE user_id = current_user_id OR friend_id = current_user_id;
    DELETE FROM public.friend_requests WHERE sender_id = current_user_id OR receiver_id = current_user_id;
    DELETE FROM public.blocked_users WHERE blocker_id = current_user_id OR blocked_id = current_user_id;
    DELETE FROM public.reports WHERE reporter_id = current_user_id OR reported_id = current_user_id;
    DELETE FROM public.room_players WHERE user_id = current_user_id;
    DELETE FROM public.game_players WHERE user_id = current_user_id;
    DELETE FROM public.player_stats WHERE user_id = current_user_id;
    DELETE FROM public.profiles WHERE id = current_user_id;

    -- Delete the user from auth.users (cascades any remaining auth tokens/identities)
    DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- add_bot_to_room (add search_path; body preserved verbatim)
CREATE OR REPLACE FUNCTION public.add_bot_to_room(
    p_room_id UUID,
    p_bot_name TEXT DEFAULT 'Bot Player',
    p_bot_avatar TEXT DEFAULT 'detective'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_host_id UUID;
    v_max_players INT;
    v_current_count INT;
    v_new_player RECORD;
BEGIN
    -- Check room and host
    SELECT host_id, max_players INTO v_host_id, v_max_players
    FROM public.rooms
    WHERE id = p_room_id;

    IF v_host_id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;

    IF auth.uid() != v_host_id THEN
        RAISE EXCEPTION 'Only the room host can add bots.';
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM public.room_players
    WHERE room_id = p_room_id;

    IF v_current_count >= v_max_players THEN
        RAISE EXCEPTION 'Room is already full.';
    END IF;

    INSERT INTO public.room_players (
        room_id,
        user_id,
        is_ready,
        is_host,
        is_bot,
        bot_name,
        bot_avatar
    )
    VALUES (
        p_room_id,
        NULL,
        true,
        false,
        true,
        p_bot_name,
        p_bot_avatar
    )
    RETURNING * INTO v_new_player;

    RETURN to_jsonb(v_new_player);
END;
$$;

-- remove_bot_from_room (add search_path; body preserved verbatim)
CREATE OR REPLACE FUNCTION public.remove_bot_from_room(
    p_room_id UUID,
    p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_host_id UUID;
BEGIN
    SELECT host_id INTO v_host_id
    FROM public.rooms
    WHERE id = p_room_id;

    IF v_host_id IS NULL THEN
        RAISE EXCEPTION 'Room not found.';
    END IF;

    IF auth.uid() != v_host_id THEN
        RAISE EXCEPTION 'Only the room host can remove bots.';
    END IF;

    DELETE FROM public.room_players
    WHERE id = p_player_id AND room_id = p_room_id AND is_bot = true;

    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- ISSUE 8: Missing indexes on hot FK / RLS-filtered columns
-- (Existing composite unique indexes already cover their leading column, e.g.
-- friend_requests(sender_id, receiver_id), so only the non-leading columns and
-- unindexed FKs are added here.)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages (room_id);
CREATE INDEX IF NOT EXISTS idx_messages_game_id ON public.messages (game_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON public.game_events (game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user_id ON public.game_players (user_id);
CREATE INDEX IF NOT EXISTS idx_games_room_id ON public.games (room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON public.rooms (host_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON public.friend_requests (receiver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships (friend_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON public.blocked_users (blocked_id);

-- =============================================================================
-- End of RLS hardening migration
-- =============================================================================




