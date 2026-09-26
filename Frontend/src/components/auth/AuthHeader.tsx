import React, { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { AuthLayout } from './useAuthLayout';

interface AuthHeaderProps {
  layout: AuthLayout;
  title?: string;
  subtitle?: string;
}

export const AuthHeader = memo(function AuthHeader({
  layout,
  title = 'MAFIA',
  subtitle = 'TRUST NO ONE • SUSPECT EVERYONE',
}: AuthHeaderProps) {
  return (
    <View style={[styles.titleContainer, { marginBottom: layout.titleGap }]}>
      <Text
        style={[
          styles.titleText,
          { fontSize: layout.titleFontSize, letterSpacing: layout.titleLetterSpacing },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.15}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View style={[styles.goldDivider, { width: layout.dividerWidth }]}>
        <View style={styles.dividerDiamond} />
      </View>
      <Text
        style={[
          styles.subtitleText,
          { fontSize: layout.subtitleFontSize, letterSpacing: layout.subtitleLetterSpacing },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={1.2}
      >
        {subtitle}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  titleContainer: {
    width: '100%',
    alignItems: 'center',
  },
  titleText: {
    color: '#fde68a',
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(217, 119, 6, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  goldDivider: {
    height: 1,
    backgroundColor: 'rgba(253, 230, 138, 0.35)',
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerDiamond: {
    width: 6,
    height: 6,
    backgroundColor: '#fde68a',
    transform: [{ rotate: '45deg' }],
  },
  subtitleText: {
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
