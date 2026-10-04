// TODO: unused — room settings are edited in LobbyScreen; not wired into navigation
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder screen. Actual room-settings editing lives in LobbyScreen.
 * This stub is intentionally not wired into navigation (see src/screens/index.ts,
 * owned by the coordinator). Kept as a safe, dark-themed placeholder so that if it
 * is ever mounted it renders consistently with the rest of the app instead of a
 * bare white screen.
 */
export default function RoomSettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Room Settings</Text>
      <Text style={styles.subtitle}>
        Room settings are managed from the lobby.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
});
