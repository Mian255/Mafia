import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

// Shared singleton players — created lazily on first use so expo-audio is never
// touched outside a game session (it also needs a native build, not Expo Go).
let ambiencePlayer: AudioPlayer | null = null;
let stingPlayer: AudioPlayer | null = null;
let tickPlayer: AudioPlayer | null = null;

const NIGHT_AMBIENCE = require('../../assets/sounds/night-ambience.wav');
const ROLE_STING = require('../../assets/sounds/role-sting.wav');
const ROLE_TICK = require('../../assets/sounds/role-wake-tick.wav');
const DAWN_CHIME = require('../../assets/sounds/dawn-chime.wav');
const VOTE_STING = require('../../assets/sounds/vote-sting.wav');

async function ensureAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
    });
  } catch {
    // Audio mode failures are non-fatal (e.g. emulator quirks).
  }
}

function getAmbience(): AudioPlayer | null {
  if (Platform.OS === 'web') return null; // web speech/sound stack differs; skip
  if (!ambiencePlayer) ambiencePlayer = createAudioPlayer(NIGHT_AMBIENCE);
  ambiencePlayer.loop = true;
  return ambiencePlayer;
}

function getStingPlayer(): AudioPlayer | null {
  if (Platform.OS === 'web') return null;
  if (!stingPlayer) stingPlayer = createAudioPlayer(ROLE_STING);
  return stingPlayer;
}

function getTickPlayer(): AudioPlayer | null {
  if (Platform.OS === 'web') return null;
  if (!tickPlayer) tickPlayer = createAudioPlayer(ROLE_TICK);
  return tickPlayer;
}

/** Ominous loop while the town sleeps. Safe to call repeatedly. */
export async function startNightAmbience(): Promise<void> {
  const p = getAmbience();
  if (!p) return;
  await ensureAudioMode();
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}

export function stopNightAmbience(): void {
  try {
    ambiencePlayer?.pause();
  } catch {}
}

/** One-shot dramatic sting; plays autonomously (capture list) or a manual cue. */
export async function playSting(kind: 'role' | 'dawn' | 'vote' | 'tick'): Promise<void> {
  let p: AudioPlayer | null;
  let src: number | undefined;
  switch (kind) {
    case 'role': p = getStingPlayer(); src = ROLE_STING; break;
    case 'tick': p = getTickPlayer(); src = ROLE_TICK; break;
    case 'dawn':
    case 'vote':
      p = getStingPlayer();
      src = kind === 'dawn' ? DAWN_CHIME : VOTE_STING;
      break;
  }
  if (!p) return;
  await ensureAudioMode();
  try {
    // expo-audio players are cheap to repoint; replace the source for one-shots
    // sharing a single player so we don't spawn a player per sound.
    p.replace(src as number);
    p.seekTo(0);
    p.play();
  } catch {}
}

export function stopAllPhaseAudio(): void {
  stopNightAmbience();
  try { stingPlayer?.pause(); } catch {}
  try { tickPlayer?.pause(); } catch {}
}

/**
 * usePhaseAudio — drives the tense audio layer from game state.
 *
 *  * `night` phase: starts the looping ambience; stops it everywhere else.
 *  * role-activation staging: while night falls, plays a `tick` every
 *    `tickIntervalSec` seconds (simulating roles waking one by one, tension
 *    building) until the player themselves acts — matching how a narrator
 *    would call roles around the table.
 *  * `dawn`/`result` with a revealed death: dawn chime / vote sting.
 *
 * Respects the user's Settings toggles (ambientSound / soundEffects) via the
 * same AsyncStorage key the SettingsScreen writes ('settings:prefs').
 */
export function usePhaseAudio(
  phase: string | undefined,
  opts: { ambientSound: boolean; soundEffects: boolean }
): void {
  const optsRef = useRef(opts);
  // Mirror post-commit, never during render (react-hooks/refs).
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  // Ambience follows the night phase only.
  useEffect(() => {
    if (!phase) return;
    if (phase === 'night' && optsRef.current.ambientSound) {
      void startNightAmbience();
    } else {
      stopNightAmbience();
    }
    return () => stopNightAmbience();
  }, [phase]);

  // One-shot stings keyed off phase entry.
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!phase) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === phase) return;
    if (!optsRef.current.soundEffects) return;
    if (phase === 'night') {
      void playSting('role');
    } else if (phase === 'dawn') {
      void playSting('dawn');
    } else if (phase === 'result') {
      void playSting('vote');
    }
  }, [phase]);
}
