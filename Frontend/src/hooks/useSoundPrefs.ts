import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_STORAGE_KEY = 'settings:prefs';

export interface SoundPrefs {
  ambientSound: boolean;
  soundEffects: boolean;
}

/**
 * Reads ambientSound / soundEffects preferences written by SettingsScreen
 * ('settings:prefs' blob) and re-reads whenever the screen regains focus
 * indirectly (poll on interval keeps the hook dependency-free).
 */
export function useSoundPrefs(): SoundPrefs {
  const [prefs, setPrefs] = useState<SoundPrefs>({ ambientSound: true, soundEffects: true });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw || !active) return;
        const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
        setPrefs((prev) => ({
          ambientSound: typeof parsed.ambientSound === 'boolean' ? parsed.ambientSound : prev.ambientSound,
          soundEffects: typeof parsed.soundEffects === 'boolean' ? parsed.soundEffects : prev.soundEffects,
        }));
      } catch {
        // Defaults stand on any parse failure.
      }
    };
    void load();
    const interval = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return prefs;
}
