import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Shared audio preference keys, persisted to AsyncStorage so they survive
 * app restarts and are readable by any screen (Home, Settings, game phase).
 */
const KEYS = {
  soundEffects: '@mafia/audio/soundEffects',
  bgMusic: '@mafia/audio/bgMusic',
  vibrations: '@mafia/audio/vibrations',
} as const;

export type AudioSettings = {
  soundEffects: boolean;
  bgMusic: boolean;
  vibrations: boolean;
};

const DEFAULTS: AudioSettings = {
  soundEffects: true,
  bgMusic: true,
  vibrations: true,
};

/** Load persisted audio settings once; falls back to defaults if nothing is stored. */
async function loadAudioSettings(): Promise<AudioSettings> {
  try {
    const [soundEffects, bgMusic, vibrations] = await Promise.all([
      AsyncStorage.getItem(KEYS.soundEffects),
      AsyncStorage.getItem(KEYS.bgMusic),
      AsyncStorage.getItem(KEYS.vibrations),
    ]);

    return {
      soundEffects: soundEffects !== null ? soundEffects !== 'false' : DEFAULTS.soundEffects,
      bgMusic: bgMusic !== null ? bgMusic !== 'false' : DEFAULTS.bgMusic,
      vibrations: vibrations !== null ? vibrations !== 'false' : DEFAULTS.vibrations,
    };
  } catch {
    // If AsyncStorage is unavailable (e.g. during tests or a malformed install),
    // degrade gracefully to defaults.
    return DEFAULTS;
  }
}

async function setAudioSetting<K extends keyof AudioSettings>(
  key: K,
  value: AudioSettings[K]
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS[key], String(value));
  } catch {
    // Best-effort persistence; a failed write should never block the UI.
  }
}

/**
 * Global audio settings hook.

 *  Used by the app root to keep a single source of truth for audio preferences
 *  and by screens (Home, Settings) to react to changes. Persists to AsyncStorage
 *  so the user's Sound Effects toggle survives restarts.
 */
export function useAudioSettings(): AudioSettings & {
  setSoundEffects: (value: boolean) => void;
  setBgMusic: (value: boolean) => void;
  setVibrations: (value: boolean) => void;
} {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULTS);
  const loadedRef = useRef(false);

  // Load persisted settings once on first render.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    loadAudioSettings().then((loaded) => {
      setSettings(loaded);
    });
  }, []);

  const update = useCallback(
    <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        setAudioSetting(key, value).catch(() => {});
        return next;
      });
    },
    []
  );

  return {
    soundEffects: settings.soundEffects,
    bgMusic: settings.bgMusic,
    vibrations: settings.vibrations,
    // Expose mutators so callers can wire them to toggle controls.
    setSoundEffects: useCallback((value: boolean) => update('soundEffects', value), []),
    setBgMusic: useCallback((value: boolean) => update('bgMusic', value), []),
    setVibrations: useCallback((value: boolean) => update('vibrations', value), []),
  };
}
