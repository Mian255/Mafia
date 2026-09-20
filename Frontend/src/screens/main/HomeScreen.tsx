import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { BottomNavBar, NavTab } from '../../components/BottomNavBar';
import {
  ExpandedRoleModal,
  ROLES_DATA,
  RoleCard,
  RoleData,
} from '../../components/RoleCard';
import FriendsScreen from './FriendsScreen';
import SettingsScreen from './SettingsScreen';

interface HomeScreenProps {
  userAlias?: string;
  onLogout?: () => void;
}

export default function HomeScreen({ userAlias = 'Operative', onLogout }: HomeScreenProps) {
  const [activeTab, setActiveTab] = useState<NavTab>('play');
  const [selectedRole, setSelectedRole] = useState<RoleData | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

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

  const handleCardSelect = (role: RoleData) => {
    setSelectedRole(role);
    setIsDossierOpen(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Main Screen Body */}
      <View style={styles.mainContent}>
        {activeTab === 'play' && (
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Top Navigation / Status Header */}
            <View style={styles.topHeaderBar}>
              {/* Left: Only MAFIA */}
              <Text style={styles.brandTitle}>MAFIA</Text>

              {/* Right: Stats Pill + Profile Icon */}
              <View style={styles.rightHeaderGroup}>
                <View style={styles.statsPill}>
                  <Text style={styles.flagEmoji}>🏁</Text>
                  <Text style={styles.statsText}>
                    <Text style={styles.statsCount}>248</Text> PLAYED •{' '}
                    <Text style={styles.winRateText}>64% WIN</Text>
                  </Text>
                </View>

                {/* User Profile Avatar Icon Button */}
                <TouchableOpacity
                  style={styles.profileAvatarBtn}
                  activeOpacity={0.8}
                  onPress={() => setIsProfileModalOpen(true)}
                >
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Circle cx="12" cy="8" r="4" fill="#cbd5e1" />
                    <Path
                      d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20"
                      fill="#cbd5e1"
                    />
                  </Svg>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Play Banner Card */}
            <TouchableOpacity style={styles.quickPlayCard} activeOpacity={0.9}>
              {/* Left Play Triangle Button */}
              <View style={styles.playIconContainer}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d="M7 4L19 12L7 20V4Z" fill="#ffffff" />
                </Svg>
              </View>

              {/* Middle Play Info */}
              <View style={styles.quickPlayDetails}>
                <View style={styles.quickPlayHeaderRow}>
                  <Text style={styles.quickPlayTitle}>QUICK PLAY</Text>
                  <View style={styles.fastMatchTag}>
                    <Text style={styles.fastMatchTagText}>FAST MATCH</Text>
                  </View>
                </View>
                <Text style={styles.quickPlaySub}>10-16 Players</Text>
              </View>
            </TouchableOpacity>

            {/* Two Action Cards: Create Room & Join By Code */}
            <View style={styles.actionsGrid}>
              {/* CREATE ROOM */}
              <TouchableOpacity style={styles.actionBox} activeOpacity={0.85}>
                <View style={styles.actionIconPill}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Circle cx="12" cy="12" r="9" stroke="#eab308" strokeWidth="2" />
                    <Path d="M12 8V16M8 12H16" stroke="#eab308" strokeWidth="2" strokeLinecap="round" />
                  </Svg>
                </View>

                <Text style={styles.actionBoxTitle}>CREATE ROOM</Text>
                <Text style={styles.actionBoxSub}>Host Custom Syndicate</Text>

                <View style={styles.actionBoxFooter}>
                  <Text style={[styles.actionBoxLink, { color: '#eab308' }]}>
                    CUSTOM RULES ➔
                  </Text>
                </View>
              </TouchableOpacity>

              {/* JOIN BY CODE */}
              <TouchableOpacity style={styles.actionBox} activeOpacity={0.85}>
                <View style={styles.actionIconPill}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Rect x="4" y="4" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="10.25" y="4" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="16.5" y="4" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="4" y="10.25" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="10.25" y="10.25" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="16.5" y="10.25" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="4" y="16.5" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="10.25" y="16.5" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                    <Rect x="16.5" y="16.5" width="3.5" height="3.5" rx="1" fill="#94a3b8" />
                  </Svg>
                </View>

                <Text style={styles.actionBoxTitle}>JOIN BY CODE</Text>
                <Text style={styles.actionBoxSub}>Enter 6-Digit Room Key</Text>

                <View style={styles.actionBoxFooter}>
                  <Text style={[styles.actionBoxLink, { color: '#cbd5e1' }]}>
                    DIRECT ENTRY 🔑
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Game Roles Section Header */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Text style={styles.sectionIcon}>🎴</Text>
                <Text style={styles.sectionTitleText}>GAME ROLES</Text>
              </View>
              <Text style={styles.sectionSubtitleText}>4 UNIQUE SPECIALTIES</Text>
            </View>

            {/* 2x2 Grid of Roles with Real Assets and Instant Flip */}
            <View style={styles.rolesGrid}>
              {/* Row 1: Mafia & Detective */}
              <View style={styles.rolesRow}>
                <RoleCard role={ROLES_DATA.mafia} onSelect={handleCardSelect} />
                <RoleCard role={ROLES_DATA.detective} onSelect={handleCardSelect} />
              </View>

              {/* Row 2: Doctor & Civilian */}
              <View style={styles.rolesRow}>
                <RoleCard role={ROLES_DATA.doctor} onSelect={handleCardSelect} />
                <RoleCard role={ROLES_DATA.civilian} onSelect={handleCardSelect} />
              </View>
            </View>
          </ScrollView>
        )}

        {activeTab === 'friends' && <FriendsScreen />}

        {activeTab === 'settings' && <SettingsScreen onLogout={handleLogout} />}
      </View>

      {/* Expanded Dramatic Role 3D Flip Dossier Modal */}
      <ExpandedRoleModal
        role={selectedRole}
        visible={isDossierOpen}
        onClose={() => setIsDossierOpen(false)}
      />

      {/* Operative Profile Modal */}
      <Modal
        visible={isProfileModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsProfileModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsProfileModalOpen(false)}>
          <View style={styles.profileModalBackdrop}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.profileModalCard}>
                <View style={styles.profileModalHeader}>
                  <View style={styles.profileAvatarBust}>
                    <Text style={styles.profileAvatarInitial}>
                      {userAlias.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.profileAliasName}>{userAlias}</Text>
                    <Text style={styles.profileStatusTag}>VERIFIED OPERATIVE</Text>
                  </View>
                </View>

                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStatBlock}>
                    <Text style={styles.profileStatNumber}>248</Text>
                    <Text style={styles.profileStatCaption}>MATCHES</Text>
                  </View>
                  <View style={styles.profileStatBlock}>
                    <Text style={[styles.profileStatNumber, { color: '#22c55e' }]}>64%</Text>
                    <Text style={styles.profileStatCaption}>WIN RATE</Text>
                  </View>
                  <View style={styles.profileStatBlock}>
                    <Text style={[styles.profileStatNumber, { color: '#eab308' }]}>Lvl 34</Text>
                    <Text style={styles.profileStatCaption}>SYNDICATE</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.profileLogoutAction}
                  onPress={() => {
                    setIsProfileModalOpen(false);
                    handleLogout();
                  }}
                >
                  <Text style={styles.profileLogoutActionText}>LOG OUT</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.profileCloseAction}
                  onPress={() => setIsProfileModalOpen(false)}
                >
                  <Text style={styles.profileCloseActionText}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Bottom Navigation Bar */}
      <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  mainContent: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 28,
  },

  /* Top Bar */
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandTitle: {
    color: '#e11d48',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  rightHeaderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statsPill: {
    backgroundColor: '#111724',
    borderWidth: 1,
    borderColor: '#1e2638',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  flagEmoji: {
    fontSize: 11,
  },
  statsText: {
    color: '#cbd5e1',
    fontSize: 10.5,
    fontWeight: '700',
  },
  statsCount: {
    color: '#ffffff',
    fontWeight: '900',
  },
  winRateText: {
    color: '#facc15',
    fontWeight: '900',
  },
  profileAvatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a2232',
    borderWidth: 1,
    borderColor: '#243046',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Quick Play */
  quickPlayCard: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  playIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#991b1b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  quickPlayDetails: {
    flex: 1,
  },
  quickPlayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  quickPlayTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  fastMatchTag: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fastMatchTagText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  quickPlaySub: {
    color: '#fee2e2',
    fontSize: 10.5,
    fontWeight: '600',
  },

  /* Action Cards */
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  actionBox: {
    flex: 1,
    backgroundColor: '#111724',
    borderWidth: 1,
    borderColor: '#1e2638',
    borderRadius: 14,
    padding: 14,
  },
  actionIconPill: {
    marginBottom: 8,
  },
  actionBoxTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  actionBoxSub: {
    color: '#8e9eb5',
    fontSize: 10,
    marginBottom: 10,
  },
  actionBoxFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1a2233',
    paddingTop: 8,
  },
  actionBoxLink: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* Section Header */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionIcon: {
    fontSize: 14,
  },
  sectionTitleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sectionSubtitleText: {
    color: '#8e9eb5',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  /* Roles Grid */
  rolesGrid: {
    gap: 12,
  },
  rolesRow: {
    flexDirection: 'row',
    gap: 12,
  },

  /* Profile Modal */
  profileModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 6, 12, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  profileModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#101522',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#243046',
    padding: 20,
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  profileAvatarBust: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarInitial: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  profileAliasName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  profileStatusTag: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  profileStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#161c2b',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 18,
  },
  profileStatBlock: {
    flex: 1,
    alignItems: 'center',
  },
  profileStatNumber: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  profileStatCaption: {
    color: '#8e9eb5',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  profileLogoutAction: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  profileLogoutActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  profileCloseAction: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  profileCloseActionText: {
    color: '#8e9eb5',
    fontSize: 11,
    fontWeight: '700',
  },
});
