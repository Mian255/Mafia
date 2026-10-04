-- =============================================================================
-- Migration: Add Bot and Room Enhancements
-- 1. Add bot columns to room_players
-- 2. Make user_id nullable for bot players
-- 3. Update RLS policies to allow host to add/remove bots
-- 4. RPCs for atomic bot operations
-- =============================================================================

-- 1. Add bot columns to room_players
ALTER TABLE public.room_players 
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bot_name TEXT,
ADD COLUMN IF NOT EXISTS bot_avatar TEXT;

-- 2. Make user_id nullable for bots
ALTER TABLE public.room_players 
ALTER COLUMN user_id DROP NOT NULL;

-- 3. Adjust unique constraint so multiple bots with NULL user_id can exist
ALTER TABLE public.room_players 
DROP CONSTRAINT IF EXISTS unique_room_player;

CREATE UNIQUE INDEX IF NOT EXISTS unique_room_player_idx 
ON public.room_players (room_id, user_id) 
WHERE user_id IS NOT NULL;

-- 4. Update RLS on room_players to allow hosts to add/remove bots
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_players;
CREATE POLICY "Users can join rooms" 
    ON public.room_players FOR INSERT 
    WITH CHECK (
        (auth.uid() = user_id AND is_bot = false)
        OR (is_bot = true AND EXISTS (
            SELECT 1 FROM public.rooms WHERE id = room_players.room_id AND host_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "Users can leave rooms or host can kick" ON public.room_players;
CREATE POLICY "Users can leave rooms or host can kick" 
    ON public.room_players FOR DELETE 
    USING (
        (auth.uid() = user_id)
        OR EXISTS (
            SELECT 1 FROM public.rooms WHERE id = room_players.room_id AND host_id = auth.uid()
        )
    );

-- 5. RPC Functions for atomic Bot Management (Security Definer)
CREATE OR REPLACE FUNCTION public.add_bot_to_room(
    p_room_id UUID,
    p_bot_name TEXT DEFAULT 'Bot Player',
    p_bot_avatar TEXT DEFAULT 'detective'
)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.remove_bot_from_room(
    p_room_id UUID,
    p_player_id UUID
)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
