import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChatPanel, GameShell, PlayerAvatar, PrimaryButton, type PhaseScreenProps } from './gameUi';
import VoiceBar from '../../components/VoiceBar';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';

const PHASE_LABEL: Record<string, string> = {
  role_reveal: 'Role Reveal',
  night: 'Night',
  dawn: 'Dawn',
  day_discussion: 'Discussion',
  day_voting: 'Voting',
  result: 'Verdict',
};

/**
 * Shown to eliminated players. They spectate the living game and talk privately
 * in the `ghost` channel until the game ends (GameOverScreen takes over then).
 */
export default function DeadPlayerScreen({ state, currentUserId, onExit, narratorMessage }: PhaseScreenProps) {
  const { game, players, messages, sendChat, activeChannel, timeRemaining } = state;
  const living = players.filter((p) => p.is_alive);
  const phaseLabel = game ? PHASE_LABEL[game.phase] ?? 'Spectating' : 'Spectating';

  return (
    <GameShell
      phaseLabel="Spectating"
      round={game?.round_number}
      timeRemaining={timeRemaining}
      accent={colors.textFaint}
      narratorMessage={narratorMessage}
    >
      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>👻</Text>
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerTitle}>You were eliminated</Text>
          <Text style={styles.bannerSub}>Watch how it unfolds — {phaseLabel} in progress.</Text>
        </View>
        <TouchableOpacity
          style={styles.bannerExitBtn}
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit game"
        >
          <Text style={styles.bannerExitText}>EXIT</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rosterWrap}>
        <Text style={styles.rosterLabel}>{living.length} STILL ALIVE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roster}>
          {living.map((p) => (
            <View key={p.id} style={styles.rosterItem}>
              <PlayerAvatar player={p} size={40} />
              <Text style={styles.rosterName} numberOfLines={1}>
                {p.username}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Ghost voice (MAF-074): eliminated players talk privately. */}
      {game && <VoiceBar channel="ghost" ids={{ gameId: game.id }} compact />}

      <ChatPanel
        messages={messages}
        currentUserId={currentUserId}
        onSend={sendChat}
        accent={colors.textDim}
        placeholder="Ghost chat…"
        disabled={activeChannel !== 'ghost'}
      />

      {/* Eliminated players can leave at any time instead of spectating. */}
      <View style={styles.exitWrap}>
        <PrimaryButton label="Exit Game" onPress={onExit} />
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    margin: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  exitWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  bannerIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  bannerInfo: {
    flex: 1,
  },
  bannerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  bannerSub: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  bannerExitBtn: {
    marginLeft: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
  },
  bannerExitText: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  rosterWrap: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  rosterLabel: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  roster: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  rosterItem: {
    alignItems: 'center',
    width: 56,
  },
  rosterName: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    maxWidth: 56,
  },
});
