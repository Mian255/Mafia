import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  CHARACTER_IMAGES,
  ExpandedRoleModal,
  ROLES_DATA,
  type RoleData,
} from '../../components/RoleCard';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';
import { GameShell, ROLE_COLOR, type PhaseScreenProps } from './gameUi';

/**
 * Shows the player their secret role for a few seconds before night falls.
 * Reuses ROLES_DATA / CHARACTER_IMAGES and the flip-card modal from RoleCard.
 */
export default function RoleRevealScreen({ state, narratorMessage }: PhaseScreenProps) {
  const { game, myRole, timeRemaining } = state;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const role: RoleData | null = myRole ? ROLES_DATA[myRole] : null;
  const accent = myRole ? ROLE_COLOR[myRole] : colors.accent;

  return (
    <GameShell
      phaseLabel="Role Reveal"
      round={game?.round_number}
      timeRemaining={timeRemaining}
      accent={accent}
      narratorMessage={narratorMessage}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>YOUR SECRET ROLE</Text>

        {role ? (
          <>
            <View style={[styles.imageFrame, { borderColor: accent }]}>
              <Image
                source={CHARACTER_IMAGES[role.id]}
                style={styles.image}
                resizeMode="cover"
                fadeDuration={0}
              />
              <View style={[styles.factionPill, { backgroundColor: role.badgeBg }]}>
                <Text style={[styles.factionPillText, { color: role.factionColor }]}>
                  {role.faction}
                </Text>
              </View>
            </View>

            <Text style={styles.roleName}>{role.name}</Text>
            <Text style={[styles.ability, { color: accent }]}>{role.abilityTitle}</Text>
            <Text style={styles.desc}>{role.shortDesc}</Text>

            <TouchableOpacity
              style={[styles.detailsBtn, { borderColor: accent }]}
              onPress={() => setDetailsOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="View full role details"
            >
              <Text style={[styles.detailsBtnText, { color: accent }]}>VIEW DETAILS</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.desc}>Assigning your role…</Text>
        )}

        <Text style={styles.hint}>Memorise your role. Night falls soon.</Text>
      </ScrollView>

      <ExpandedRoleModal role={role} visible={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </GameShell>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  kicker: {
    color: colors.textDim,
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: spacing.lg,
  },
  imageFrame: {
    width: 220,
    height: 220,
    borderRadius: radius.xl,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  image: {
    width: 220,
    height: 300,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  factionPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  factionPillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  roleName: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: spacing.xl,
  },
  ability: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  desc: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  detailsBtn: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  detailsBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },
  hint: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    marginTop: spacing.xxl,
    textAlign: 'center',
  },
});
