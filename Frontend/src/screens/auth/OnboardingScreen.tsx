import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// TODO: unimplemented / not wired — this screen is a placeholder and is not referenced by
// App.tsx navigation. It is styled to match the app's dark theme so it never flashes a white
// screen if it is ever mounted before the real onboarding flow lands.
export default function OnboardingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ONBOARDING</Text>
      <Text style={styles.subtitle}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2.5,
    color: '#fde68a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
    textAlign: 'center',
  },
});
