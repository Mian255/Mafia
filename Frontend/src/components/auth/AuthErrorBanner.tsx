import React, { memo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

interface AuthErrorBannerProps {
  message?: string | null;
  style?: StyleProp<ViewStyle>;
}

export const AuthErrorBanner = memo(function AuthErrorBanner({
  message,
  style,
}: AuthErrorBannerProps) {
  if (!message) return null;

  return (
    <View style={[styles.errorBox, style]}>
      <Text
        style={styles.errorText}
        maxFontSizeMultiplier={1.3}
        accessibilityLiveRegion="polite"
      >
        {message}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  errorBox: {
    backgroundColor: 'rgba(153, 27, 27, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    width: '100%',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
});
