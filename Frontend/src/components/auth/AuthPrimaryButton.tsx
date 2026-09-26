import React, { memo } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const ButtonGradient = memo(function ButtonGradient() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="primaryBtnGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#dc2626" />
            <Stop offset="50%" stopColor="#991b1b" />
            <Stop offset="100%" stopColor="#580f0f" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx="14" ry="14" fill="url(#primaryBtnGrad)" />
      </Svg>
    </View>
  );
});

interface AuthPrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const AuthPrimaryButton = memo(function AuthPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: AuthPrimaryButtonProps) {
  const isBusy = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.button, isBusy && !loading && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={isBusy}
      accessibilityRole="button"
      accessibilityState={{ disabled: isBusy, busy: loading }}
      activeOpacity={0.85}
    >
      <ButtonGradient />
      {loading ? (
        <ActivityIndicator color="#fde68a" size="small" />
      ) : (
        <Text style={styles.buttonText} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    marginTop: 6,
    shadowColor: '#dc2626',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fef08a',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});
