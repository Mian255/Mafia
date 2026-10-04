import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';

// Dev-only screen. Minimal dark-themed preview of the shared design tokens.
const ROLE_SWATCHES: { label: string; color: string }[] = [
  { label: 'Mafia', color: colors.mafia },
  { label: 'Detective', color: colors.detective },
  { label: 'Doctor', color: colors.doctor },
  { label: 'Civilian', color: colors.civilian },
];

export default function UIShowcaseScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>UI Showcase</Text>
      <Text style={styles.subtitle}>Design tokens preview</Text>

      <View style={styles.swatchRow}>
        {ROLE_SWATCHES.map((swatch) => (
          <View key={swatch.label} style={styles.swatchItem}>
            <View style={[styles.swatch, { backgroundColor: swatch.color }]} />
            <Text style={styles.swatchLabel}>{swatch.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
      <Text style={styles.caption}>accent</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  swatchItem: {
    alignItems: 'center',
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchLabel: {
    fontSize: fontSize.xs,
    color: colors.textDim,
    marginTop: spacing.xs,
  },
  accentBar: {
    width: 120,
    height: 8,
    borderRadius: radius.pill,
    marginTop: spacing.xl,
  },
  caption: {
    fontSize: fontSize.xs,
    color: colors.textDim,
    marginTop: spacing.xs,
  },
});
