import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Room } from '../../lib/rooms';
import { useGameState } from '../../hooks/useGameState';
import { useNarrator } from '../../hooks/useNarrator';
import { useSoundPrefs } from '../../hooks/useSoundPrefs';
import { usePhaseAudio } from '../../lib/phaseAudio';
import { colors, fontSize, spacing } from '../../theme/tokens';
import { PrimaryButton } from './gameUi';
import RoleRevealScreen from './RoleRevealScreen';
import NightScreen from './NightScreen';
import DawnScreen from './DawnScreen';
import DayDiscussionScreen from './DayDiscussionScreen';
import VotingScreen from './VotingScreen';
import GameOverScreen from './GameOverScreen';
import DeadPlayerScreen from './DeadPlayerScreen';

interface GameScreenProps {
  room: Room;
  currentUserId: string;
  onExit: () => void;
}

/**
 * Container for an in-progress game. Owns useGameState and routes to the phase
 * sub-screen. Dead players spectate via DeadPlayerScreen until game_over, when
 * everyone sees GameOverScreen. All sub-screens are prop-driven off `state`.
 */
export default function GameScreen({ room, currentUserId, onExit }: GameScreenProps) {
  const state = useGameState(room.id, currentUserId);
  const narrator = useNarrator(state);
  const soundPrefs = useSoundPrefs();
  usePhaseAudio(state.game?.phase, soundPrefs);
  const { loading, error, game, isAlive } = state;

  // Loading / error / no-active-game fallbacks.
  if (loading || (!game && !error)) {
    return (
      <View style={styles.centered}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.centeredText}>Loading game…</Text>
      </View>
    );
  }

  if (error || !game) {
    return (
      <View style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.errorText}>{error ?? 'This game is no longer available.'}</Text>
        <View style={styles.exitButton}>
          <PrimaryButton label="Back to Home" onPress={onExit} />
        </View>
      </View>
    );
  }

  const props = {
    state,
    currentUserId,
    onExit,
    narratorMessage: narrator.currentMessage,
    speakCustom: narrator.speakCustom,
  };

  // Game over is shown to everyone (alive or dead) before the dead-player branch.
  if (game.phase === 'game_over') return <GameOverScreen {...props} />;

  // A dead player spectates + gets ghost chat regardless of the live phase.
  if (!isAlive) return <DeadPlayerScreen {...props} />;

  switch (game.phase) {
    case 'role_reveal':
      return <RoleRevealScreen {...props} />;
    case 'night':
      return <NightScreen key={`${game.round_number}-${game.night_stage ?? 'mafia'}`} {...props} />;
    case 'dawn':
    case 'result':
      return <DawnScreen {...props} />;
    case 'day_discussion':
      return <DayDiscussionScreen {...props} />;
    case 'day_voting':
      return <VotingScreen {...props} />;
    default:
      return <RoleRevealScreen {...props} />;
  }
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centeredText: {
    color: colors.textDim,
    fontSize: fontSize.md,
    marginTop: spacing.lg,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  exitButton: {
    alignSelf: 'stretch',
  },
});
