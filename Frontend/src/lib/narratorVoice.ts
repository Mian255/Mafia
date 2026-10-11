import * as Speech from 'expo-speech';

/**
 * Text-to-Speech Narrator for Mafia game phase transitions.
 *
 * Mobile-only by design: this uses expo-speech (the native Android/iOS TTS
 * engine) exclusively. The Web SpeechSynthesis path was removed because the
 * game targets a development build on device and the browser voice was
 * inconsistent with the mobile narrator.
 */

// expo-speech clips the final word on several Android TTS engines unless the
// utterance ends in sentence punctuation with a short trailing breath. We also
// must not call Speech.stop() and Speech.speak() in the same tick — that race
// drops/truncates the utterance. prepareForTts normalises the text; the speak
// defer in speakNarrator handles the timing.
function prepareForTts(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const punctuated = /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return `${punctuated}  `;
}

export function speakNarrator(text: string, onDone?: () => void) {
  const clean = prepareForTts(text);
  if (!clean) {
    if (onDone) onDone();
    return;
  }

  try {
    Speech.stop();
  } catch {
    // ignore — nothing was speaking
  }

  // One-frame deferral so the engine has settled after stop() before the new
  // utterance starts; calling speak() synchronously after stop() is the main
  // cause of the narrator cutting off before the last word.
  setTimeout(() => {
    try {
      Speech.speak(clean, {
        language: 'en',
        pitch: 0.88, // Deep dramatic narrator pitch
        rate: 0.9,
        onDone,
        onError: () => {
          if (onDone) onDone();
        },
      });
    } catch {
      if (onDone) onDone();
    }
  }, 60);
}

/** Stops any active narrator speech. */
export function stopNarrator() {
  try {
    Speech.stop();
  } catch {
    // ignore
  }
}
