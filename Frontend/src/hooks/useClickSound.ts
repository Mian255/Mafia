import { useCallback, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';

// Menu click SFX — one short UI tap sound shared across the game menu.
const CLICK_SOUND_URI = require('../../assets/sounds/universfield-interface-click-124476.mp3');

interface UseClickSoundReturn {
  /** Play the menu click sound. Safe to fire on every press-in; rapid taps are
   *  handled by stopping any in-flight playback first, so the sound never layers. */
  play: () => void;
  /** Whether audio is currently enabled for menu SFX. Driven by the app's
   *  Sound Effects toggle (Settings > Audio & Gameplay). */
  enabled: boolean;
  /** Most recent playback status of the click sound, if it has been loaded.
   *  Useful for debugging load/fatal errors. */
  soundStatus: AVPlaybackStatus | undefined;
}

/** Menu-click sound hook.

 *  Loads a short UI-click MP3 once on first play attempt and reuses a single
 *  `Audio.Sound` object. Designed to be called from `onPressIn` on
 *  TouchableOpacity/TouchableWithoutFeedback in the game menu — the moment
 *  the user begins a tap feels more responsive than waiting for `onPress`.
 *
 *  The sound is gated behind an `enabled` flag (the app's "Sound Effects" toggle)
 *  so the menu stays silent when the user has turned SFX off. The toggle can be
 *  swapped for a global audio context later without changing this hook.
 */
export function useClickSound(
  enabled: boolean,
): UseClickSoundReturn {
  // A single shared Sound object; reused across rapid taps.
  const soundRef = useRef<Audio.Sound | null>(null);
  const soundStatusRef = useRef<AVPlaybackStatus | undefined>(undefined);
  const enabledRef = useRef(enabled);
  const loadAttemptedRef = useRef(false);

  // Keep a ref in sync so the play() path always sees the latest setting without
  // re-creating handlers each render.
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // One-time load. We load on first play attempt rather than on mount so the
  // initial cold start isn't penalized by a 50KB MP3 while the app is still
  // hydrating the rest of the UI.
  const ensureLoaded = useCallback(async () => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
      });

      const { sound, status } = await Audio.Sound.createAsync(
        CLICK_SOUND_URI,
        { shouldPlay: false, volume: 1.0 },
        null,
        false // don't downloadFirst — the asset is bundled locally
      );

      soundRef.current = sound;
      soundStatusRef.current = status;
    } catch (err) {
      // If the sound can't load (missing file, denied permissions, etc.) we
      // silently degrade — menu taps should never throw.
      console.warn('Click sound failed to load:', err);
      soundStatusRef.current = { isLoaded: false } as AVPlaybackStatus;
    }
  }, []);

  const play = useCallback(async () => {
    if (!enabledRef.current) return;

    await ensureLoaded();

    const sound = soundRef.current;
    if (!sound) return;

    try {
      const currentStatus = await sound.getStatusAsync();
      soundStatusRef.current = currentStatus;

      if (!currentStatus.isLoaded) {
        // Shouldn't normally happen here, but be defensive.
        return;
      }

      if (currentStatus.isPlaying) {
        // For a short UI click, stopping and immediately replaying gives the
        // snappiest feel on rapid taps without layering two clips.
        await sound.stopAsync();
      }

      // dismissInterruptions isn't available on this API surface, so if another
      // app's audio is active the clip may not play. That's acceptable for a menu
      // SFX — the user's music/browser is more important than a tap sound.
      await sound.playAsync();
    } catch (err) {
      // Degrade silently on playback errors (interrupted, disposed, etc.).
      console.warn('Click sound playback failed:', err);
    }
  }, [ensureLoaded]);

  // Dispose the sound when the hook unmounts (e.g. switching screens).
  useEffect(() => {
    return () => {
      try {
        soundRef.current?.stopAsync().catch(() => {});
      } catch {
        // ignore
      }
      try {
        soundRef.current?.unloadAsync().catch(() => {});
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    play,
    enabled: enabledRef.current,
    soundStatus: soundStatusRef.current,
  };
}
