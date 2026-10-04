import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChatPanel, GameShell, PlayerAvatar, type PhaseScreenProps } from './gameUi';
import VoiceBar from '../../components/VoiceBar';
import { colors, fontSize, spacing } from '../../theme/tokens';

/**
 * Day discussion. Living players debate in the `day` chat channel while a strip
 * of surviving seats stays visible. Voting follows when the timer expires.
 */
export default function DayDiscussionScreen({ state, currentUserId }: PhaseScreenProps) {
  const { game, players, messages, sendChat, activeChannel, timeRemaining } = state;
  const living = players.filter((p) => p.is_alive);

  return (
    <GameShell
      phaseLabel="Discussion"
      round={game?.round_number}
      timeRemaining={timeRemaining}
      accent={colors.civilian}
    >
      <View style={styles.rosterWrap}>
        <Text style={styles.rosterLabel}>{living.length} ALIVE</Text>
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

      {/* Voice comms (MAF-072/075): living players talk during the day. */}
      {game && <VoiceBar channel="day" ids={{ gameId: game.id }} compact />}

      <ChatPanel
        messages={messages}
        currentUserId={currentUserId}
        onSend={sendChat}
        accent={colors.civilian}
        placeholder="Share your suspicions…"
        disabled={activeChannel !== 'day'}
      />
    </GameShell>
  );
}

const styles = StyleSheet.create({
  rosterWrap: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
