-- Migration: Do not set OAuth avatar on new user creation.
-- Avatars are purely in-game choices (civilian, detective, doctor, mafia, or initial).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
            'Player_' || SUBSTRING(NEW.id::text FROM 1 FOR 6)
        ),
        NEW.email,
        NULL -- Avatars are only selected from within the game
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up any existing external OAuth avatar URLs from profiles
UPDATE public.profiles
SET avatar_url = NULL
WHERE avatar_url LIKE 'http://%' OR avatar_url LIKE 'https://%';
