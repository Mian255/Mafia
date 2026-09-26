import React, { memo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface AuthCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const AuthCard = memo(function AuthCard({ children, style }: AuthCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
});

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: 'rgba(11, 18, 32, 0.94)',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(253, 230, 138, 0.28)',
    shadowColor: '#000000',
    shadowOpacity: 0.85,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
