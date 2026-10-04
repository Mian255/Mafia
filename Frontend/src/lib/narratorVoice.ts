import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

/**
 * Text-to-Speech Narrator voice synthesizer for Mafia game phase transitions.
 * Operates across Native (Expo Speech) and Web (SpeechSynthesis API).
 */
export function speakNarrator(text: string, onDone?: () => void) {
  if (!text) return;

  // Web Speech API fallback
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.pitch = 0.88; // Deep dramatic narrator pitch
      if (onDone) utterance.onend = onDone;
      window.speechSynthesis.speak(utterance);
      return;
    } catch (e) {
      console.warn('Web Speech API error:', e);
    }
  }

  // Native Expo Speech
  try {
    Speech.stop();
    Speech.speak(text, {
      language: 'en',
      pitch: 0.88,
      rate: 0.92,
      onDone,
    });
  } catch (err) {
    console.warn('Expo Speech error:', err);
  }
}

/** Stops any active narrator speech */
export function stopNarrator() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  try {
    Speech.stop();
  } catch {
    // ignore
  }
}
