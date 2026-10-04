-- =============================================================================
-- Migration: Account + Social RPCs
--   1. get_email_for_username  - login-by-username without exposing the email column
--   2. accept_friend_request   - atomic request acceptance + friendship creation
--   3. friendships INSERT RLS policy (audit: table had only SELECT + DELETE)
--   4. Drop broken delete_user_account RPC (edge function is authoritative)
--
-- Idempotent: DROP FUNCTION IF EXISTS + CREATE OR REPLACE; DROP POLICY IF EXISTS.
-- Every SECURITY DEFINER function SETs search_path = public.
--
-- Identifiers verified against schema.sql:
--   profiles(id, username UNIQUE, email)               -- LOWER() indexes exist
--   friend_requests(id, sender_id, receiver_id, status IN
--                   ('pending','accepted','declined','cancelled'))
--   friendships(id, user_id, friend_id) UNIQUE(user_id, friend_id)
--   Stats table is public.user_stats (NOT player_stats); there is NO friends table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. get_email_for_username
-- Resolves a username (or a directly supplied email) to a single email address
-- so the client can log in by username WITHOUT the email column being readable
-- via RLS. Returns exactly one match or NULL - no listing / enumeration.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_email_for_username(text);

CREATE OR REPLACE FUNCTION public.get_email_for_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_email text;
BEGIN
    IF p_username IS NULL OR length(btrim(p_username)) = 0 THEN
        RETURN NULL;
    END IF;

    -- Caller passed an email directly: only echo it back (as-is) when a profile
    -- with that email actually exists (case-insensitive). Otherwise NULL.
    IF position('@' IN p_username) > 0 THEN
        SELECT p.email INTO v_email
        FROM public.profiles p
        WHERE lower(p.email) = lower(p_username)
        LIMIT 1;

        IF v_email IS NULL THEN
            RETURN NULL;
        END IF;

        RETURN p_username;  -- return as-is per contract
    END IF;

    -- Otherwise resolve username -> email, case-insensitively, single match only.
    SELECT p.email INTO v_email
    FROM public.profiles p
    WHERE lower(p.username) = lower(p_username)
    LIMIT 1;

    RETURN v_email;  -- NULL if no matching profile / no stored email
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_email_for_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_email_for_username(text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. accept_friend_request
-- Friendship shape decision: schema.sql stores ONE directed row per friendship.
-- Evidence: both the SELECT and DELETE policies on public.friendships use
--   USING (auth.uid() = user_id OR auth.uid() = friend_id)
-- i.e. a single row is made visible/deletable to BOTH parties. A two-row
-- reciprocal model would only need `auth.uid() = user_id`. So we insert a single
-- row owned by the accepter (user_id = receiver_id, friend_id = sender_id).
--
-- The whole function body runs in one implicit transaction, so the request
-- status update and the friendship insert are committed atomically.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.accept_friend_request(uuid);

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_id   uuid;
    v_receiver_id uuid;
    v_status      text;
BEGIN
    SELECT sender_id, receiver_id, status
      INTO v_sender_id, v_receiver_id, v_status
      FROM public.friend_requests
     WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;

    IF v_receiver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    IF v_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'not_pending';
    END IF;

    UPDATE public.friend_requests
       SET status = 'accepted'
     WHERE id = p_request_id;

    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (v_receiver_id, v_sender_id)
    ON CONFLICT (user_id, friend_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_friend_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. friendships INSERT RLS policy
-- Audit found public.friendships had only SELECT + DELETE policies (no INSERT),
-- which silently blocks any direct client insert. accept_friend_request above is
-- SECURITY DEFINER and therefore bypasses RLS, but we still add an explicit
-- INSERT policy so the table is fully governed: a user may only create a
-- friendship row they own (user_id = auth.uid()). This is consistent with the
-- definer path, which inserts user_id = receiver_id = the accepting caller.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create their own friendships" ON public.friendships;
CREATE POLICY "Users can create their own friendships"
    ON public.friendships FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. Drop the broken delete_user_account RPC
-- The prior RPC (migration 20260926000002) referenced non-existent tables
-- public.friends and public.player_stats, so it aborts on execution. The
-- delete-account edge function is the AUTHORITATIVE deletion path: it verifies
-- the caller's JWT then calls auth.admin.deleteUser(), and profiles.id
-- REFERENCES auth.users(id) ON DELETE CASCADE removes all dependent rows
-- (profiles, user_stats, room_players, game_players, friend_requests,
-- friendships, blocked_users, reports, messages, votes, night_actions, ...).
-- SQL cannot delete auth.users rows portably from a client-invoked RPC, so we
-- drop the RPC rather than recreate it.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_user_account();
