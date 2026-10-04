import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PlayerAvatar, GameShell, ROLE_COLOR, ROLE_LABEL, type PhaseScreenProps } from './gameUi';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';
import type { GameRole } from '../../types/database';

/**
 * Reveal screen shared by the `dawn` phase (night outcome) and the `result`
 * phase (vote outcome). Reads the matching latest event banner from state and
 * shows who — if anyone — was lost, plus their role when revealed.
 */
export default function DawnScreen({ state, narratorMessage }: PhaseScreenProps) {
  const { game, players, latestNightResult, latestVoteResult, timeRemaining } = state;
  const isVote = game?.phase === 'result';

  const victimId = isVote
    ? latestVoteResult?.eliminatedPlayerId ?? null
    : latestNightResult?.killedPlayerId ?? null;
  const revealedRole: GameRole | null = isVote
    ? latestVoteResult?.role ?? null
    : latestNightResult?.role ?? null;

  const victim = useMemo(
    () => (victimId ? players.find((p) => p.id === victimId) ?? null : null),
    [players, victimId]
  );

  const accent = isVote ? colors.accent : colors.detective;
  const phaseLabel = isVote ? 'Verdict' : 'Dawn';

  let headline: string;
  let sub: string;
  if (victim) {
    headline = `${victim.username} is out`;
    sub = isVote ? 'The town has spoken. They were voted out.' : 'They were killed during the night.';
  } else if (!isVote && latestNightResult?.saved) {
    headline = 'A quiet night';
    sub = 'The doctor’s intervention saved a life. No one died.';
  } else if (isVote) {
    headline = 'No one eliminated';
    sub = 'The vote was tied or skipped. Everyone survives another round.';
  } else {
    headline = 'A peaceful night';
    sub = 'No one was harmed while the town slept.';
  }

  return (
    <GameShell phaseLabel={phaseLabel} round={game?.round_number} timeRemaining={timeRemaining} accent={accent} narratorMessage={narratorMessage}>
      <View style={styles.content}>
        {victim ? (
          <View style={styles.victimWrap}>
            <PlayerAvatar player={victim} size={96} />
            {revealedRole && (
              <View style={[styles.rolePill, { backgroundColor: ROLE_COLOR[revealedRole] }]}>
                <Text style={styles.rolePillText}>{ROLE_LABEL[revealedRole]}</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.peaceIcon}>{isVote ? '⚖️' : '🌅'}</Text>
        )}

        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  victimWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  rolePill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  rolePillText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  peaceIcon: {
    fontSize: 72,
    marginBottom: spacing.xl,
  },
  headline: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: '900',
    textAlign: 'center',
  },
  sub: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
