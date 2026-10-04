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
  const { game, myRole, latestNightResult, latestVoteResult } = state;
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const prevPhaseRef = useRef<string | null>(null);
  const prevRoundRef = useRef<number | null>(null);

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

    prevPhaseRef.current = game.phase;
    prevRoundRef.current = game.round_number;

    if (!phaseChanged && !roundChanged) return;

    // Handle phase transitions
    switch (game.phase) {
      case 'role_reveal': {
        speak('Welcome to the game! Secretly review your assigned role. Night will fall shortly.');
        break;
      }
      case 'night': {
        let msg = 'Night falls over the town. Everyone, close your eyes.';
        if (myRole === 'mafia') {
          msg += ' Mafia, open your eyes and choose your target to eliminate.';
        } else if (myRole === 'doctor') {
          msg += ' Doctor, open your eyes and select someone to protect tonight.';
        } else if (myRole === 'detective') {
          msg += ' Detective, open your eyes and select a player to investigate.';
        } else {
          msg += ' Special roles are making their moves under darkness.';
        }
        speak(msg);
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

    return () => {
      stopNarrator();
    };
  }, [game, game?.phase, game?.round_number, game?.winner, myRole, latestNightResult, latestVoteResult]);

  return {
    currentMessage,
    isSpeaking,
    speakCustom: speak,
  };
}
