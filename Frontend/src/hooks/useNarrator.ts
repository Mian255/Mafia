import { useEffect, useRef, useState } from 'react';
import type { GameStateValue } from './useGameState';
import { speakNarrator, stopNarrator } from '../lib/narratorVoice';

export interface NarratorState {
  currentMessage: string | null;
  isSpeaking: boolean;
  speakCustom: (text: string) => void;
}

/**
 * Custom hook that monitors game phase changes and triggers voice narration + banner prompts
 * for:
 * 1. Nightfall: "Everyone close your eyes."
 * 2. Role-specific night prompts: "Mafia open your eyes" -> target kill -> "Mafia close your eyes."
 * 3. Dawn: "Everyone open your eyes." + Night outcome.
 * 4. Day Discussion & Voting phases.
 * 5. Game Over / Faction Victory.
 */
export function useNarrator(state: GameStateValue): NarratorState {
  const { game, nightStage, latestNightResult, latestVoteResult } = state;
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const prevPhaseRef = useRef<string | null>(null);
  const prevRoundRef = useRef<number | null>(null);
  const prevStageRef = useRef<string | null>(null);

  const speak = (text: string) => {
    setTimeout(() => {
      setCurrentMessage(text);
      setIsSpeaking(true);
      speakNarrator(text, () => {
        setIsSpeaking(false);
      });
    }, 0);
  };

  useEffect(() => {
    if (!game) return;

    const phaseChanged = prevPhaseRef.current !== game.phase;
    const roundChanged = prevRoundRef.current !== game.round_number;
    const stageChanged = prevStageRef.current !== nightStage;

    prevPhaseRef.current = game.phase;
    prevRoundRef.current = game.round_number;
    prevStageRef.current = nightStage;

    if (!phaseChanged && !roundChanged && !stageChanged) return;

    // Handle phase transitions
    switch (game.phase) {
      case 'role_reveal': {
        speak('Welcome to the game! Secretly review your assigned role. Night will fall shortly.');
        break;
      }
      case 'night': {
        // Sequential night: narrate whichever role the narrator is waking now.
        const stage = nightStage ?? 'mafia';
        if (stage === 'mafia') {
          speak(
            'Night falls over the town. Everyone, close your eyes. Mafia, open your eyes and choose your target to eliminate.'
          );
        } else if (stage === 'doctor') {
          speak('Mafia, close your eyes. Doctor, open your eyes and choose someone to protect tonight.');
        } else if (stage === 'detective') {
          speak('Doctor, close your eyes. Detective, open your eyes and choose a suspect to investigate.');
        }
        break;
      }
      case 'dawn': {
        let msg = 'Dawn arrives! Everyone, open your eyes.';
        if (latestNightResult?.killedPlayerId && !latestNightResult.saved) {
          msg += ' The town awakes to find a member was eliminated during the night.';
        } else {
          msg += ' The sun rises. Miraculously, everyone survived the night!';
        }
        speak(msg);
        break;
      }
      case 'day_discussion': {
        speak('Town discussion begins! Discuss the clues, debate suspects, and find the Mafia.');
        break;
      }
      case 'day_voting': {
        speak('Voting phase is now open! Cast your vote to exile the main suspect.');
        break;
      }
      case 'result': {
        if (latestVoteResult?.eliminatedPlayerId) {
          speak('The town has spoken! The voted player has been exiled from the town.');
        } else {
          speak('The votes were tied. No one was exiled today.');
        }
        break;
      }
      case 'game_over': {
        if (game.winner === 'mafia') {
          speak('Game Over! The Mafia has taken over the town and claimed victory!');
        } else {
          speak('Game Over! Justice prevails! The innocent townsfolk have saved the town!');
        }
        break;
      }
      default:
        break;
    }
    // NOTE: no per-run cleanup here. This effect re-runs on every `game` /
    // result update (see deps), so a stopNarrator() cleanup would cut the
    // narrator off mid-sentence on the next realtime tick — the root cause of
    // the "last word never spoken" bug. Speech is stopped when a new line is
    // spoken (speak() calls Speech.stop()) and once on unmount, below.
  }, [game, game?.phase, game?.round_number, game?.winner, nightStage, latestNightResult, latestVoteResult]);

  // Stop any narration exactly once, when the game screen unmounts.
  useEffect(() => {
    return () => {
      stopNarrator();
    };
  }, []);

  return {
    currentMessage,
    isSpeaking,
    speakCustom: speak,
  };
}
