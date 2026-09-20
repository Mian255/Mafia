import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

interface SettingsScreenProps {
  onLogout?: () => void;
}

export default function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const [ambientSound, setAmbientSound] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [streamerMode, setStreamerMode] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SYNDICATE SETTINGS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>AUDIO & IMMERSION</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Noir Ambient Audio</Text>
              <Text style={styles.settingSub}>Rain, jazz, and curfew soundscape</Text>
            </View>
            <Switch
              value={ambientSound}
              onValueChange={setAmbientSound}
              trackColor={{ false: '#334155', true: '#e11d48' }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Haptic Tensions</Text>
              <Text style={styles.settingSub}>Heartbeat pulses during voting phase</Text>
            </View>
            <Switch
              value={hapticFeedback}
              onValueChange={setHapticFeedback}
              trackColor={{ false: '#334155', true: '#e11d48' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>CONFIDENTIALITY</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Streamer Cloak Mode</Text>
              <Text style={styles.settingSub}>Hides room codes and private operative IDs</Text>
            </View>
            <Switch
              value={streamerMode}
              onValueChange={setStreamerMode}
              trackColor={{ false: '#334155', true: '#e11d48' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>SESSION</Text>
        <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.8} onPress={onLogout}>
          <Text style={styles.logoutBtnText}>TERMINATE SESSION (LOG OUT)</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
    paddingHorizontal: 20,
    paddingTop: 54,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1,
  },
  content: {
    paddingBottom: 30,
  },
  sectionHeader: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 14,
  },
  card: {
    backgroundColor: '#0f141d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  settingSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 4,
  },
  logoutBtn: {
    backgroundColor: '#1f131a',
    borderWidth: 1.5,
    borderColor: '#e11d48',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutBtnText: {
    color: '#f43f5e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
