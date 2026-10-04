import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerAvatar, PrimaryButton, ROLE_COLOR, ROLE_LABEL, type PhaseScreenProps } from './gameUi';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';
import type { GameWinner } from '../../types/database';

const WINNER_COPY: Record<Exclude<GameWinner, null>, { title: string; sub: string; color: string }> = {
  town: { title: 'Town Wins', sub: 'The citizens rooted out every last member of the mafia.', color: colors.doctor },
  mafia: { title: 'Mafia Wins', sub: 'The syndicate seized control of the town.', color: colors.mafia },
  draw: { title: 'Draw', sub: 'Neither side could claim victory.', color: colors.textDim },
};

/**
 * End-of-game summary: winner banner, the fully revealed roster (roles are
 * unmasked once the game is over), and a route back home.
 */
export default function GameOverScreen({ state, onExit, narratorMessage }: PhaseScreenProps) {
  const { game, players } = state;
  const winner = game?.winner ?? null;
  const copy = winner ? WINNER_COPY[winner] : WINNER_COPY.draw;

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {narratorMessage && (
          <View style={{ backgroundColor: 'rgba(225, 29, 72, 0.12)', borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.35)', padding: 12, borderRadius: 10, marginBottom: 16 }}>
            <Text style={{ color: '#f43f5e', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 2 }}>🎙️ NARRATOR</Text>
            <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: '600' }}>{narratorMessage}</Text>
          </View>
        )}
        <Text style={styles.kicker}>GAME OVER</Text>
        <Text style={[styles.title, { color: copy.color }]}>{copy.title}</Text>
        <Text style={styles.sub}>{copy.sub}</Text>

        <Text style={styles.rosterHeading}>Final Roster</Text>
        <View style={styles.roster}>
          {players.map((p) => (
            <View key={p.id} style={styles.row}>
              <PlayerAvatar player={p} size={40} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {p.username}
                </Text>
                <Text style={[styles.rowStatus, { color: p.is_alive ? colors.doctor : colors.textFaint }]}>
                  {p.is_alive ? 'Survived' : 'Eliminated'}
                </Text>
              </View>
              {p.role && (
                <View style={[styles.rolePill, { backgroundColor: ROLE_COLOR[p.role] }]}>
                  <Text style={styles.rolePillText}>{ROLE_LABEL[p.role]}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Back to Home" onPress={onExit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.xl,
    paddingTop: 72,
  },
  kicker: {
    color: colors.textDim,
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  sub: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
  rosterHeading: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  roster: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowName: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  rowStatus: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  rolePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  rolePillText: {
    color: colors.textPrimary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
});
