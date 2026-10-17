import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GameShell, PrimaryButton, SeatTile, type PhaseScreenProps } from './gameUi';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';

type Selection = string | 'skip' | null;

/**
 * Day voting. Living players tap a living seat (or Skip) and confirm; the vote
 * can be changed until the timer expires. Resolution happens server-side.
 */
export default function VotingScreen({ state, currentUserId, narratorMessage }: PhaseScreenProps) {
  const { game, players, mySeat, myRole, timeRemaining, castVote, investigationHistory, latestInvestigation } = state;
  const [selected, setSelected] = useState<Selection>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const candidates = players.filter((p) => p.is_alive && p.id !== mySeat?.id);
  const isDetective = myRole === 'detective';

  const allIntel = investigationHistory.length > 0
    ? investigationHistory
    : latestInvestigation
      ? [latestInvestigation]
      : [];

  const handleConfirm = async () => {
    if (selected === null) return;
    setSubmitting(true);
    try {
      await castVote(selected === 'skip' ? null : selected);
      setSubmitted(true);
    } catch (e) {
      Alert.alert('Vote failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GameShell
      phaseLabel="Voting"
      round={game?.round_number}
      timeRemaining={timeRemaining}
      accent={colors.accent}
      narratorMessage={narratorMessage}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Detective Investigation Dossier in Voting Screen */}
        {isDetective && allIntel.length > 0 && (
          <View style={styles.intelBox}>
            <Text style={styles.intelTitle}>🕵️ DETECTIVE EVIDENCE</Text>
            {allIntel.map((item, idx) => (
              <Text
                key={`${item.round}-${item.targetName || idx}`}
                style={[styles.intelRow, { color: item.isMafia ? '#ef4444' : '#10b981' }]}
              >
                R{item.round}: {item.targetName || 'Suspect'} → {item.isMafia ? '🚨 CONFIRMED MAFIA' : '🕊️ INNOCENT'}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.prompt}>Vote to eliminate a suspect.</Text>
        {submitted && (
          <Text style={styles.submittedNote}>Vote locked in — you can still change it before time runs out.</Text>
        )}

        <View style={styles.grid}>
          {candidates.map((p) => (
            <SeatTile
              key={p.id}
              player={p}
              selected={selected === p.id}
              onPress={(sel) => setSelected(sel.id)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.skip, selected === 'skip' && styles.skipSelected]}
          onPress={() => setSelected('skip')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Skip vote"
          accessibilityState={{ selected: selected === 'skip' }}
        >
          <Text style={[styles.skipText, selected === 'skip' && styles.skipTextSelected]}>
            Skip — no elimination
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={submitting ? 'Submitting…' : submitted ? 'Change Vote' : 'Confirm Vote'}
          onPress={handleConfirm}
          disabled={selected === null || submitting}
        />
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
  },
  prompt: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  submittedNote: {
    color: colors.accent,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  skip: {
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  skipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  skipTextSelected: {
    color: colors.textPrimary,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  intelBox: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.detective,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  intelTitle: {
    color: colors.detective,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  intelRow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
});
