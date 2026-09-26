-- =============================================================================
-- Migration: Add secure account deletion RPC for authenticated users
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users only
REVOKE EXECUTE ON FUNCTION public.delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
