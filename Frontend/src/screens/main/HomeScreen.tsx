import React, { useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import { BottomNavBar, NavTab } from "../../components/BottomNavBar";
import {
  CHARACTER_IMAGES,
  ExpandedRoleModal,
  ROLES_DATA,
  RoleCard,
  RoleData,
  RoleId,
} from "../../components/RoleCard";
import { SnapchatPullRefreshScreen } from "../../components/refresh";
import FriendsScreen from "./FriendsScreen";
import SettingsScreen from "./SettingsScreen";
import { useStableCallback } from "../../hooks/useStableCallback";

interface HomeScreenProps {
  userAlias?: string;
  onLogout?: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
}

interface UserStats {
  games_played: number;
  games_won: number;
  mafia_wins: number;
  civilian_wins: number;
  doctor_wins: number;
  detective_wins: number;
}

interface UserProfile {
  username: string;
  avatar_url: string | null;
}

export default function HomeScreen({
  userAlias = "Player",
  onLogout,
  onCreateRoom,
  onJoinRoom,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<NavTab>("play");
  const [selectedRole, setSelectedRole] = useState<RoleData | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Handle Android hardware/gesture back button inside HomeScreen
  useEffect(() => {
    const handleBackPress = () => {
      if (isDossierOpen) {
        setIsDossierOpen(false);
        return true;
      }
      if (isProfileModalOpen) {
        setIsProfileModalOpen(false);
        return true;
      }
      if (activeTab !== "play") {
        setActiveTab("play");
        return true;
      }
      return false; // delegate to root App handler
    };

    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );
    return () => backSubscription.remove();
  }, [isDossierOpen, isProfileModalOpen, activeTab]);

  // Dynamic Backend State
  const [stats, setStats] = useState<UserStats>({
    games_played: 0,
    games_won: 0,
    mafia_wins: 0,
    civilian_wins: 0,
    doctor_wins: 0,
    detective_wins: 0,
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadUserData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [{ data: profileData }, { data: statsData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("user_stats")
          .select("games_played, games_won, mafia_wins, civilian_wins, doctor_wins, detective_wins")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (profileData) {
        const typedProfile = profileData as { username: string; avatar_url: string | null };
        setProfile({
          username: typedProfile.username,
          avatar_url: typedProfile.avatar_url,
        });
      }

      if (statsData) {
        const typedStats = statsData as UserStats;
        setStats({
          games_played: typedStats.games_played ?? 0,
          games_won: typedStats.games_won ?? 0,
          mafia_wins: typedStats.mafia_wins ?? 0,
          civilian_wins: typedStats.civilian_wins ?? 0,
          doctor_wins: typedStats.doctor_wins ?? 0,
          detective_wins: typedStats.detective_wins ?? 0,
        });
      }
    } catch (err) {
      console.warn("Error loading user data:", err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let statsChannel: ReturnType<typeof supabase.channel> | null = null;
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;

    const initUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || !isMounted) return;

        await loadUserData();

        const statsName = `user_stats_${user.id}`;
        const existingStats = supabase.getChannels().find((c) => c.topic === `realtime:${statsName}`);
        if (existingStats) supabase.removeChannel(existingStats);

        statsChannel = supabase
          .channel(statsName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_stats",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (isMounted && payload.new) {
                const newStats = payload.new as UserStats;
                setStats({
                  games_played: newStats.games_played ?? 0,
                  games_won: newStats.games_won ?? 0,
                  mafia_wins: newStats.mafia_wins ?? 0,
                  civilian_wins: newStats.civilian_wins ?? 0,
                  doctor_wins: newStats.doctor_wins ?? 0,
                  detective_wins: newStats.detective_wins ?? 0,
                });
              }
            }
          )
          .subscribe();

        const profileName = `user_profile_${user.id}`;
        const existingProfile = supabase.getChannels().find((c) => c.topic === `realtime:${profileName}`);
        if (existingProfile) supabase.removeChannel(existingProfile);

        profileChannel = supabase
          .channel(profileName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${user.id}`,
            },
            (payload) => {
              if (isMounted && payload.new) {
                const updated = payload.new as { username: string; avatar_url: string | null };
                setProfile({
                  username: updated.username,
                  avatar_url: updated.avatar_url,
                });
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.warn("Error initializing user data:", err);
      }
    };

    initUserData();

    return () => {
      isMounted = false;
      if (statsChannel) supabase.removeChannel(statsChannel);
      if (profileChannel) supabase.removeChannel(profileChannel);
    };
  }, [loadUserData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadUserData();
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      console.warn("Pull to refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [loadUserData]);

  const handleRolePress = useCallback((role: RoleData) => {
    setSelectedRole(role);
    setIsDossierOpen(true);
  }, []);

  const handleLogout = useStableCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Sign out error:", err);
    }
    onLogout?.();
  });

  const winRate =
    stats.games_played > 0
      ? Math.round((stats.games_won / stats.games_played) * 100)
      : 0;
  const displayName = profile?.username || userAlias || "Player";
  const initial = displayName.charAt(0).toUpperCase();

  const avatarKey = profile?.avatar_url as RoleId | undefined;
  const activeAvatarSource =
    avatarKey && CHARACTER_IMAGES[avatarKey] ? CHARACTER_IMAGES[avatarKey] : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Main Viewport Content based on active navigation tab */}
      <View style={styles.mainContent}>
        {activeTab === "play" && (
          <SnapchatPullRefreshScreen
            refreshing={refreshing}
            onRefresh={onRefresh}
            renderHeader={() => (
              <View
                style={[
                  styles.headerWrapper,
                  { paddingTop: Math.max(insets.top + 8, 48) },
                ]}
              >
                {/* Top Bar Header */}
                <View style={styles.topHeaderBar}>
                  <Text style={styles.brandTitle}>MAFIA</Text>
                  <View style={styles.rightHeaderGroup}>
                    <View style={styles.statsPill}>
                      <Text style={styles.flagEmoji}>⚔️</Text>
                      <Text style={styles.statsText}>
                        WINS: <Text style={styles.statsCount}>{stats.games_won}</Text>
                      </Text>
                      <Text style={styles.winRateText}>({winRate}%)</Text>
                    </View>

                    {/* Profile Pill / Button */}
                    <TouchableOpacity
                      style={styles.profileAvatarBtn}
                      activeOpacity={0.8}
                      onPress={() => setIsProfileModalOpen(true)}
                    >
                      {activeAvatarSource ? (
                        <Image
                          source={activeAvatarSource}
                          style={styles.headerAvatarImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.headerAvatarInitial}>{initial}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Action Cards: Create Room & Join Room */}
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionBox, styles.createRoomCard]}
                activeOpacity={0.85}
                onPress={onCreateRoom}
              >
                <View style={[styles.actionIconPill, styles.createRoomIconPill]}>
                  <Svg width={26} height={26} viewBox="0 0 24 24">
                    <Path
                      d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                      fill="#e11d48"
                    />
                  </Svg>
                </View>
                <Text style={styles.actionBoxTitle}>CREATE ROOM</Text>
                <Text style={styles.actionBoxSub}>Host a custom game lobby with friends</Text>
                <View style={styles.actionBoxFooter}>
                  <Text style={[styles.actionBoxLink, { color: "#e11d48" }]}>
                    HOST LOBBY →
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBox, styles.joinRoomCard]}
                activeOpacity={0.85}
                onPress={onJoinRoom}
              >
                <View style={[styles.actionIconPill, styles.joinRoomIconPill]}>
                  <Svg width={26} height={26} viewBox="0 0 24 24">
                    <Path
                      d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
                      fill="#38bdf8"
                    />
                  </Svg>
                </View>
                <Text style={styles.actionBoxTitle}>JOIN ROOM</Text>
                <Text style={styles.actionBoxSub}>Enter with 5-character code or list</Text>
                <View style={styles.actionBoxFooter}>
                  <Text style={[styles.actionBoxLink, { color: "#38bdf8" }]}>
                    FIND ROOM →
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Roles Header */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Text style={styles.sectionIcon}>🎭</Text>
                <Text style={styles.sectionTitleText}>ROLES GUIDE</Text>
              </View>
              <Text style={styles.sectionSubtitleText}>4 UNIQUE ROLES</Text>
            </View>

            {/* Roles Grid */}
            <View style={styles.rolesGrid}>
              <View style={styles.rolesRow}>
                <RoleCard
                  role={ROLES_DATA.mafia}
                  onSelect={handleRolePress}
                />
                <RoleCard
                  role={ROLES_DATA.detective}
                  onSelect={handleRolePress}
                />
              </View>
              <View style={styles.rolesRow}>
                <RoleCard
                  role={ROLES_DATA.doctor}
                  onSelect={handleRolePress}
                />
                <RoleCard
                  role={ROLES_DATA.civilian}
                  onSelect={handleRolePress}
                />
              </View>
            </View>
          </SnapchatPullRefreshScreen>
        )}

        {activeTab === "friends" && <FriendsScreen />}

        {activeTab === "settings" && (
          <SettingsScreen
            userAlias={profile?.username || userAlias}
            onLogout={handleLogout}
            onProfileUpdated={loadUserData}
          />
        )}
      </View>

      {/* Role Details Modal */}
      <ExpandedRoleModal
        role={selectedRole}
        visible={isDossierOpen}
        onClose={() => setIsDossierOpen(false)}
      />

      {/* User Profile Modal */}
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
                    {activeAvatarSource ? (
                      <Image
                        source={activeAvatarSource}
                        style={styles.modalAvatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.profileAvatarInitial}>{initial}</Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.profileAliasName}>{displayName}</Text>
                    <Text style={styles.profileStatusTag}>ONLINE PLAYER</Text>
                  </View>
                </View>

                {/* Stat Badges */}
                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStatBlock}>
                    <Text style={styles.profileStatNumber}>
                      {stats.games_played}
                    </Text>
                    <Text style={styles.profileStatCaption}>PLAYED</Text>
                  </View>
                  <View style={styles.profileStatBlock}>
                    <Text style={[styles.profileStatNumber, { color: "#22c55e" }]}>
                      {stats.games_won}
                    </Text>
                    <Text style={styles.profileStatCaption}>VICTORIES</Text>
                  </View>
                  <View style={styles.profileStatBlock}>
                    <Text style={[styles.profileStatNumber, { color: "#facc15" }]}>
                      {winRate}%
                    </Text>
                    <Text style={styles.profileStatCaption}>WIN RATE</Text>
                  </View>
                </View>

                {/* Role Wins Breakdown */}
                <View style={styles.roleBreakdownContainer}>
                  <Text style={styles.roleBreakdownTitle}>WINS BREAKDOWN</Text>
                  <View style={styles.roleBreakdownGrid}>
                    <View style={styles.roleBreakdownItem}>
                      <Text style={styles.roleBreakdownRole}>MAFIA</Text>
                      <Text style={[styles.roleBreakdownWins, { color: "#ef4444" }]}>
                        {stats.mafia_wins}
                      </Text>
                    </View>
                    <View style={styles.roleBreakdownItem}>
                      <Text style={styles.roleBreakdownRole}>DETECTIVE</Text>
                      <Text style={[styles.roleBreakdownWins, { color: "#38bdf8" }]}>
                        {stats.detective_wins}
                      </Text>
                    </View>
                    <View style={styles.roleBreakdownItem}>
                      <Text style={styles.roleBreakdownRole}>DOCTOR</Text>
                      <Text style={[styles.roleBreakdownWins, { color: "#4ade80" }]}>
                        {stats.doctor_wins}
                      </Text>
                    </View>
                    <View style={styles.roleBreakdownItem}>
                      <Text style={styles.roleBreakdownRole}>CIVILIAN</Text>
                      <Text style={[styles.roleBreakdownWins, { color: "#fbbf24" }]}>
                        {stats.civilian_wins}
                      </Text>
                    </View>
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
    backgroundColor: "#090d16",
  },
  mainContent: {
    flex: 1,
  },
  headerWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },

  /* Top Bar */
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  brandTitle: {
    color: "#e11d48",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  rightHeaderGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statsPill: {
    backgroundColor: "#111724",
    borderWidth: 1,
    borderColor: "#1e2638",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  flagEmoji: {
    fontSize: 14,
  },
  statsText: {
    color: "#cbd5e1",
    fontSize: 10.5,
    fontWeight: "700",
  },
  statsCount: {
    color: "#ffffff",
    fontWeight: "900",
  },
  winRateText: {
    color: "#facc15",
    fontWeight: "900",
  },
  profileAvatarBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1a2233",
    borderWidth: 1.5,
    borderColor: "#243046",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerAvatarInitial: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  headerAvatarImg: {
    width: "100%",
    height: "100%",
  },

  /* Action Cards */
  actionsGrid: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 22,
    marginTop: 4,
  },
  actionBox: {
    flex: 1,
    backgroundColor: "#101624",
    borderWidth: 1.5,
    borderColor: "#1e293b",
    borderRadius: 18,
    padding: 18,
    minHeight: 160,
    justifyContent: "space-between",
  },
  createRoomCard: {
    borderColor: "rgba(225, 29, 72, 0.35)",
    backgroundColor: "#12111d",
    shadowColor: "#e11d48",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  joinRoomCard: {
    borderColor: "rgba(56, 189, 248, 0.35)",
    backgroundColor: "#0d1624",
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  actionIconPill: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  createRoomIconPill: {
    backgroundColor: "rgba(225, 29, 72, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(225, 29, 72, 0.3)",
  },
  joinRoomIconPill: {
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  actionBoxTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  actionBoxSub: {
    color: "#8e9eb5",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 14,
  },
  actionBoxFooter: {
    borderTopWidth: 1,
    borderTopColor: "#1a2233",
    paddingTop: 10,
  },
  actionBoxLink: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  /* Section Header */
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionIcon: {
    fontSize: 14,
  },
  sectionTitleText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionSubtitleText: {
    color: "#8e9eb5",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  /* Roles Grid */
  rolesGrid: {
    gap: 12,
  },
  rolesRow: {
    flexDirection: "row",
    gap: 12,
  },

  /* Profile Modal */
  profileModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 6, 12, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  profileModalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#101522",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#243046",
    padding: 20,
  },
  profileModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  profileAvatarBust: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  modalAvatarImg: {
    width: "100%",
    height: "100%",
  },
  profileAvatarInitial: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
  },
  profileAliasName: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  profileStatusTag: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  profileStatsRow: {
    flexDirection: "row",
    backgroundColor: "#161c2b",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  profileStatBlock: {
    flex: 1,
    alignItems: "center",
  },
  profileStatNumber: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  profileStatCaption: {
    color: "#8e9eb5",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  roleBreakdownContainer: {
    backgroundColor: "#0d111a",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1a2233",
  },
  roleBreakdownTitle: {
    color: "#64748b",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1,
  },
  roleBreakdownGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  roleBreakdownItem: {
    alignItems: "center",
  },
  roleBreakdownRole: {
    color: "#94a3b8",
    fontSize: 8.5,
    fontWeight: "700",
    marginBottom: 2,
  },
  roleBreakdownWins: {
    fontSize: 13,
    fontWeight: "900",
  },
  profileLogoutAction: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  profileLogoutActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  profileCloseAction: {
    paddingVertical: 10,
    alignItems: "center",
  },
  profileCloseActionText: {
    color: "#8e9eb5",
    fontSize: 11,
    fontWeight: "700",
  },

  /* Error Banner (Fix 3) */
  errorBanner: {
    backgroundColor: "#1c1114",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  errorBannerText: {
    flex: 1,
    color: "#fca5a5",
    fontSize: 11.5,
    fontWeight: "600",
    lineHeight: 16,
  },
  errorRetryBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  errorRetryText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
