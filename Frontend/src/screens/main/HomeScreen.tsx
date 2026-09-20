import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';

interface HomeScreenProps {
  userAlias?: string;
  onLogout?: () => void;
}

export default function HomeScreen({ userAlias = 'Operative', onLogout }: HomeScreenProps) {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>WELCOME BACK,</Text>
            <Text style={styles.aliasName}>{userAlias}</Text>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Match / Play Card */}
        <TouchableOpacity style={styles.playCard} activeOpacity={0.9}>
          <View style={styles.playCardOverlay} />
          <View style={styles.playCardContent}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>QUICK MATCH</Text>
            </View>
            <Text style={styles.playCardTitle}>ENTER THE NIGHT</Text>
            <Text style={styles.playCardSubtitle}>
              Match with 6-10 players instantly in Classic Mafia mode
            </Text>
            <View style={styles.playButtonPill}>
              <Text style={styles.playButtonText}>FIND MATCH ⚔️</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Room Action Cards */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionCard} activeOpacity={0.85}>
            <Text style={styles.actionIcon}>🏛️</Text>
            <Text style={styles.actionTitle}>CREATE ROOM</Text>
            <Text style={styles.actionDesc}>Host private syndicate</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} activeOpacity={0.85}>
            <Text style={styles.actionIcon}>🔑</Text>
            <Text style={styles.actionTitle}>JOIN BY CODE</Text>
            <Text style={styles.actionDesc}>Enter secret 6-digit key</Text>
          </TouchableOpacity>
        </View>

        {/* Roles Dossier Showcase */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ROLES DOSSIER</Text>
          <Text style={styles.sectionBadge}>4 IDENTITIES</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dossierRow}
        >
          {/* Mafia Card */}
          <View style={[styles.charCard, { borderColor: '#e11d48' }]}>
            <Image
              source={require('../../../assets/characters/mafia.png')}
              style={styles.charImage}
            />
            <View style={[styles.charTag, { backgroundColor: '#e11d48' }]}>
              <Text style={styles.charTagText}>MAFIA</Text>
            </View>
          </View>

          {/* Detective Card */}
          <View style={[styles.charCard, { borderColor: '#38bdf8' }]}>
            <Image
              source={require('../../../assets/characters/detective.png')}
              style={styles.charImage}
            />
            <View style={[styles.charTag, { backgroundColor: '#0284c7' }]}>
              <Text style={styles.charTagText}>DETECTIVE</Text>
            </View>
          </View>

          {/* Doctor Card */}
          <View style={[styles.charCard, { borderColor: '#10b981' }]}>
            <Image
              source={require('../../../assets/characters/doctor.png')}
              style={styles.charImage}
            />
            <View style={[styles.charTag, { backgroundColor: '#059669' }]}>
              <Text style={styles.charTagText}>DOCTOR</Text>
            </View>
          </View>

          {/* Civilian Card */}
          <View style={[styles.charCard, { borderColor: '#a855f7' }]}>
            <Image
              source={require('../../../assets/characters/civilian.png')}
              style={styles.charImage}
            />
            <View style={[styles.charTag, { backgroundColor: '#7e22ce' }]}>
              <Text style={styles.charTagText}>CIVILIAN</Text>
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  aliasName: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  logoutButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logoutText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  playCard: {
    backgroundColor: '#1a0d18',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e11d48',
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  playCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
  },
  playCardContent: {
    padding: 22,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  liveText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  playCardTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  playCardSubtitle: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 18,
    lineHeight: 18,
  },
  playButtonPill: {
    backgroundColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#111622',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
  },
  actionIcon: {
    fontSize: 26,
    marginBottom: 8,
  },
  actionTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  actionDesc: {
    color: '#64748b',
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  sectionBadge: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  dossierRow: {
    gap: 14,
    paddingBottom: 10,
  },
  charCard: {
    width: 140,
    height: 220,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: '#0a0d14',
    position: 'relative',
  },
  charImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  charTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  charTagText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
