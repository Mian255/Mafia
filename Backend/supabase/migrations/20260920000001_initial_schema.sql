-- =============================================================================
-- Mafia Game - Complete Database Schema & RLS Policies
-- Standalone SQL script for Supabase SQL Editor or direct execution
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. PROFILES & USERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS: Anyone can view usernames and avatars, users can only update their own profile
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" 
    ON public.profiles FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Auto-create profile trigger on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || SUBSTRING(NEW.id::text, 1, 6)),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 2. ROOMS, PLAYERS & SETTINGS
-- =============================================================================

-- Helper function to generate a random 5-character alphanumeric room code
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql VOLATILE;

CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(5) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_public BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL CHECK (status IN ('lobby', 'in_progress', 'completed', 'abandoned')) DEFAULT 'lobby',
    max_players INT NOT NULL DEFAULT 10 CHECK (max_players >= 4 AND max_players <= 20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.room_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_ready BOOLEAN NOT NULL DEFAULT false,
    is_host BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_room_player UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.room_settings (
    room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    mafia_count INT NOT NULL DEFAULT 1 CHECK (mafia_count >= 1),
    doctor_enabled BOOLEAN NOT NULL DEFAULT true,
    detective_enabled BOOLEAN NOT NULL DEFAULT true,
    night_duration_seconds INT NOT NULL DEFAULT 30 CHECK (night_duration_seconds >= 15 AND night_duration_seconds <= 120),
    discussion_duration_seconds INT NOT NULL DEFAULT 90 CHECK (discussion_duration_seconds >= 30 AND discussion_duration_seconds <= 300),
    voting_duration_seconds INT NOT NULL DEFAULT 30 CHECK (voting_duration_seconds >= 15 AND voting_duration_seconds <= 120),
    narrator_enabled BOOLEAN NOT NULL DEFAULT true,
    voice_enabled BOOLEAN NOT NULL DEFAULT true,
    reveal_role_on_death BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_settings ENABLE ROW LEVEL SECURITY;

-- Rooms RLS: Public rooms or rooms user is in
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON public.rooms;
CREATE POLICY "Rooms are viewable by everyone"
    ON public.rooms FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.rooms;
CREATE POLICY "Authenticated users can create rooms"
    ON public.rooms FOR INSERT
    WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts can update their rooms" ON public.rooms;
CREATE POLICY "Hosts can update their rooms"
    ON public.rooms FOR UPDATE
    USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts can delete their rooms" ON public.rooms;
CREATE POLICY "Hosts can delete their rooms"
    ON public.rooms FOR DELETE
    USING (auth.uid() = host_id);

-- Room Players RLS
DROP POLICY IF EXISTS "Room players viewable by everyone" ON public.room_players;
CREATE POLICY "Room players viewable by everyone"
    ON public.room_players FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can join rooms" ON public.room_players;
CREATE POLICY "Users can join rooms"
    ON public.room_players FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their ready status or host can manage" ON public.room_players;
CREATE POLICY "Users can update their ready status or host can manage"
    ON public.room_players FOR UPDATE
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.rooms WHERE id = room_players.room_id AND host_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can leave rooms or host can kick" ON public.room_players;
CREATE POLICY "Users can leave rooms or host can kick"
    ON public.room_players FOR DELETE
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.rooms WHERE id = room_players.room_id AND host_id = auth.uid()
    ));

-- Room Settings RLS
DROP POLICY IF EXISTS "Room settings viewable by everyone" ON public.room_settings;
CREATE POLICY "Room settings viewable by everyone"
    ON public.room_settings FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Host can insert room settings" ON public.room_settings;
CREATE POLICY "Host can insert room settings"
    ON public.room_settings FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.rooms WHERE id = room_settings.room_id AND host_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Host can update room settings" ON public.room_settings;
CREATE POLICY "Host can update room settings"
    ON public.room_settings FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.rooms WHERE id = room_settings.room_id AND host_id = auth.uid()
    ));

-- =============================================================================
-- 3. FRIENDS & SOCIAL
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_friend_request UNIQUE (sender_id, receiver_id),
    CONSTRAINT cannot_friend_self CHECK (sender_id != receiver_id)
);

CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id),
    CONSTRAINT cannot_friendship_self CHECK (user_id != friend_id)
);

CREATE TABLE IF NOT EXISTS public.blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id),
    CONSTRAINT cannot_block_self CHECK (blocker_id != blocked_id)
);

CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Friend requests RLS
DROP POLICY IF EXISTS "Users can see their sent or received friend requests" ON public.friend_requests;
CREATE POLICY "Users can see their sent or received friend requests"
    ON public.friend_requests FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can send friend requests" ON public.friend_requests;
CREATE POLICY "Users can send friend requests"
    ON public.friend_requests FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update received requests" ON public.friend_requests;
CREATE POLICY "Users can update received requests"
    ON public.friend_requests FOR UPDATE
    USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can delete their friend requests" ON public.friend_requests;
CREATE POLICY "Users can delete their friend requests"
    ON public.friend_requests FOR DELETE
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Friendships RLS
DROP POLICY IF EXISTS "Users can view their friendships" ON public.friendships;
CREATE POLICY "Users can view their friendships"
    ON public.friendships FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can delete their friendships" ON public.friendships;
CREATE POLICY "Users can delete their friendships"
    ON public.friendships FOR DELETE
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Blocked users RLS
DROP POLICY IF EXISTS "Users can view who they blocked" ON public.blocked_users;
CREATE POLICY "Users can view who they blocked"
    ON public.blocked_users FOR SELECT
    USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block others" ON public.blocked_users;
CREATE POLICY "Users can block others"
    ON public.blocked_users FOR INSERT
    WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock others" ON public.blocked_users;
CREATE POLICY "Users can unblock others"
    ON public.blocked_users FOR DELETE
    USING (auth.uid() = blocker_id);

-- Reports RLS
DROP POLICY IF EXISTS "Users can submit reports" ON public.reports;
CREATE POLICY "Users can submit reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

-- =============================================================================
-- 4. GAME ENGINE & HIDDEN ROLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    phase TEXT NOT NULL CHECK (phase IN (
        'role_reveal',
        'night_mafia',
        'night_doctor',
        'night_detective',
        'dawn',
        'day_discussion',
        'day_voting',
        'result',
        'game_over'
    )) DEFAULT 'role_reveal',
    round_number INT NOT NULL DEFAULT 1,
    phase_deadline TIMESTAMPTZ,
    winner TEXT CHECK (winner IN ('town', 'mafia', 'draw', NULL)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.game_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('mafia', 'civilian', 'doctor', 'detective')),
    is_alive BOOLEAN NOT NULL DEFAULT true,
    death_round INT,
    death_phase TEXT,
    death_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_game_player UNIQUE (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.night_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('mafia', 'doctor', 'detective')),
    target_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_actor_round_action UNIQUE (game_id, round_number, actor_id)
);

CREATE TABLE IF NOT EXISTS public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- NULL indicates skip
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_voter_round UNIQUE (game_id, round_number, voter_id)
);

CREATE TABLE IF NOT EXISTS public.game_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

-- Security Definer helper functions to prevent RLS recursion
CREATE OR REPLACE FUNCTION public.is_game_participant(_game_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.game_players
        WHERE game_id = _game_id AND user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_mafia_player(_game_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.game_players
        WHERE game_id = _game_id AND user_id = _user_id AND role = 'mafia'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_game_over(_game_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.games
        WHERE id = _game_id AND phase = 'game_over'
    );
$$;

-- Games RLS
DROP POLICY IF EXISTS "Games viewable by participants" ON public.games;
CREATE POLICY "Games viewable by participants"
    ON public.games FOR SELECT
    USING (public.is_game_participant(id, auth.uid()));

-- Game Players RLS
DROP POLICY IF EXISTS "Players can view living status of all players in their game" ON public.game_players;
CREATE POLICY "Players can view living status of all players in their game"
    ON public.game_players FOR SELECT
    USING (public.is_game_participant(game_id, auth.uid()));

DROP POLICY IF EXISTS "Players can only view their own role or fellow mafia" ON public.game_players;
CREATE POLICY "Players can only view their own role or fellow mafia"
    ON public.game_players FOR SELECT
    USING (
        auth.uid() = user_id 
        OR (role = 'mafia' AND public.is_mafia_player(game_id, auth.uid()))
        OR public.is_game_over(game_id)
    );

-- Night actions RLS
DROP POLICY IF EXISTS "Actors can view their own night actions or fellow mafia" ON public.night_actions;
CREATE POLICY "Actors can view their own night actions or fellow mafia"
    ON public.night_actions FOR SELECT
    USING (
        auth.uid() = actor_id
        OR (role = 'mafia' AND public.is_mafia_player(game_id, auth.uid()))
    );

DROP POLICY IF EXISTS "Actors can insert their night action" ON public.night_actions;
CREATE POLICY "Actors can insert their night action"
    ON public.night_actions FOR INSERT
    WITH CHECK (auth.uid() = actor_id);

-- Votes RLS
DROP POLICY IF EXISTS "Votes viewable by game players" ON public.votes;
CREATE POLICY "Votes viewable by game players"
    ON public.votes FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.game_players WHERE game_id = votes.game_id AND user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Living players can submit their vote" ON public.votes;
CREATE POLICY "Living players can submit their vote"
    ON public.votes FOR INSERT
    WITH CHECK (
        auth.uid() = voter_id
        AND EXISTS (
            SELECT 1 FROM public.game_players
            WHERE game_id = votes.game_id AND user_id = auth.uid() AND is_alive = true
        )
    );

DROP POLICY IF EXISTS "Living players can update their vote" ON public.votes;
CREATE POLICY "Living players can update their vote"
    ON public.votes FOR UPDATE
    USING (
        auth.uid() = voter_id
        AND EXISTS (
            SELECT 1 FROM public.game_players
            WHERE game_id = votes.game_id AND user_id = auth.uid() AND is_alive = true
        )
    );

-- Game Events RLS
DROP POLICY IF EXISTS "Game events viewable by game players" ON public.game_events;
CREATE POLICY "Game events viewable by game players"
    ON public.game_events FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.game_players WHERE game_id = game_events.game_id AND user_id = auth.uid()
    ));

-- =============================================================================
-- 5. MULTI-CHANNEL CHAT
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('lobby', 'day', 'mafia', 'ghost')),
    content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messages RLS strictly enforcing channel permissions
DROP POLICY IF EXISTS "Lobby channel viewable by room members" ON public.messages;
CREATE POLICY "Lobby channel viewable by room members"
    ON public.messages FOR SELECT
    USING (
        channel = 'lobby' AND EXISTS (
            SELECT 1 FROM public.room_players WHERE room_id = messages.room_id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Day channel viewable by game participants" ON public.messages;
CREATE POLICY "Day channel viewable by game participants"
    ON public.messages FOR SELECT
    USING (
        channel = 'day' AND EXISTS (
            SELECT 1 FROM public.game_players WHERE game_id = messages.game_id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Mafia channel viewable only by mafia (alive or dead)" ON public.messages;
CREATE POLICY "Mafia channel viewable only by mafia (alive or dead)"
    ON public.messages FOR SELECT
    USING (
        channel = 'mafia' AND EXISTS (
            SELECT 1 FROM public.game_players 
            WHERE game_id = messages.game_id 
            AND user_id = auth.uid() 
            AND role = 'mafia'
        )
    );

DROP POLICY IF EXISTS "Ghost channel viewable only by dead players" ON public.messages;
CREATE POLICY "Ghost channel viewable only by dead players"
    ON public.messages FOR SELECT
    USING (
        channel = 'ghost' AND EXISTS (
            SELECT 1 FROM public.game_players 
            WHERE game_id = messages.game_id 
            AND user_id = auth.uid() 
            AND is_alive = false
        )
    );

DROP POLICY IF EXISTS "Users can send messages to channels they are permitted" ON public.messages;
CREATE POLICY "Users can send messages to channels they are permitted"
    ON public.messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND (
            (channel = 'lobby' AND EXISTS (
                SELECT 1 FROM public.room_players WHERE room_id = messages.room_id AND user_id = auth.uid()
            ))
            OR (channel = 'day' AND EXISTS (
                SELECT 1 FROM public.game_players 
                WHERE game_id = messages.game_id AND user_id = auth.uid() AND is_alive = true
            ))
            OR (channel = 'mafia' AND EXISTS (
                SELECT 1 FROM public.game_players 
                WHERE game_id = messages.game_id AND user_id = auth.uid() AND role = 'mafia'
            ))
            OR (channel = 'ghost' AND EXISTS (
                SELECT 1 FROM public.game_players 
                WHERE game_id = messages.game_id AND user_id = auth.uid() AND is_alive = false
            ))
        )
    );

-- =============================================================================
-- 6. USER STATS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_stats (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    games_played INT NOT NULL DEFAULT 0,
    games_won INT NOT NULL DEFAULT 0,
    mafia_wins INT NOT NULL DEFAULT 0,
    civilian_wins INT NOT NULL DEFAULT 0,
    doctor_wins INT NOT NULL DEFAULT 0,
    detective_wins INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stats are viewable by everyone" ON public.user_stats;
CREATE POLICY "Stats are viewable by everyone"
    ON public.user_stats FOR SELECT
    USING (true);

-- Auto-create user stats record when profile is created
CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_stats (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_stats ON public.profiles;
CREATE TRIGGER on_profile_created_stats
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();

-- =============================================================================
-- 7. REALTIME PUBLICATION
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'room_players'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'room_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_settings;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'games'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'game_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'friend_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
    END IF;
END $$;
