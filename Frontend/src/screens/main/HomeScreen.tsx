import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, Path, Rect } from "react-native-svg";
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
import FriendsScreen from "./FriendsScreen";
import SettingsScreen from "./SettingsScreen";

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
  const [activeTab, setActiveTab] = useState<NavTab>("play");
  const [selectedRole, setSelectedRole] = useState<RoleData | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let statsChannel: ReturnType<typeof supabase.channel> | null = null;
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || !isMounted) {
          if (isMounted) setLoading(false);
          return;
        }

        // Fetch profile and user stats concurrently
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

        if (isMounted) {
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
        }

        // Subscribe to live postgres changes on user_stats
        statsChannel = supabase
          .channel(`user_stats_live_${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_stats",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (isMounted && payload.new && typeof payload.new === "object") {
                const updated = payload.new as Partial<UserStats>;
                setStats((prev) => ({
                  ...prev,
                  games_played: updated.games_played ?? prev.games_played,
                  games_won: updated.games_won ?? prev.games_won,
                  mafia_wins: updated.mafia_wins ?? prev.mafia_wins,
                  civilian_wins: updated.civilian_wins ?? prev.civilian_wins,
                  doctor_wins: updated.doctor_wins ?? prev.doctor_wins,
                  detective_wins: updated.detective_wins ?? prev.detective_wins,
                }));
              }
            }
          )
          .subscribe();

        // Subscribe to live postgres changes on profiles
        profileChannel = supabase
          .channel(`profile_live_${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${user.id}`,
            },
            (payload) => {
              if (isMounted && payload.new && typeof payload.new === "object") {
                const updated = payload.new as { username?: string; avatar_url?: string | null };
                setProfile((prev) => ({
                  username: updated.username ?? (prev?.username || "Player"),
                  avatar_url: updated.avatar_url ?? (prev?.avatar_url || null),
                }));
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error("Error loading user data:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadUserData();

    return () => {
      isMounted = false;
      if (statsChannel) supabase.removeChannel(statsChannel);
      if (profileChannel) supabase.removeChannel(profileChannel);
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
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
      }
    } catch (err) {
      console.error("Error refreshing home stats:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  // Derived calculations from backend data
  const displayName = profile?.username || userAlias || "Player";
  const avatarKey = profile?.avatar_url as RoleId;
  const hasValidAvatar = avatarKey && CHARACTER_IMAGES[avatarKey];
  const gamesPlayed = stats.games_played;
  const gamesWon = stats.games_won;
  const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
  const playerLevel = Math.max(1, Math.floor(gamesPlayed / 5) + 1);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Main Screen Body */}
      <View style={styles.mainContent}>
        {activeTab === "play" && (
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#e11d48"
                colors={["#e11d48"]}
              />
            }
          >
            {/* Top Navigation / Status Header */}
            <View style={styles.topHeaderBar}>
              {/* Left: Only MAFIA */}
              <Text style={styles.brandTitle}>MAFIA</Text>

              {/* Right: Dynamic Backend Stats Pill + Profile Icon */}
              <View style={styles.rightHeaderGroup}>
                {/* Stats Pill: Tapping directly opens profile modal */}
                <TouchableOpacity
                  style={styles.statsPill}
                  activeOpacity={0.7}
                  delayPressIn={0}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 6 }}
                  onPress={() => setIsProfileModalOpen(true)}
                >
                  <Text style={styles.flagEmoji}>🏁</Text>
                  {loading && !refreshing ? (
                    <ActivityIndicator size="small" color="#facc15" style={{ transform: [{ scale: 0.7 }] }} />
                  ) : (
                    <Text style={styles.statsText}>
                      <Text style={styles.statsCount}>{gamesPlayed}</Text> PLAYED •{" "}
                      <Text style={styles.winRateText}>{winRate}% WIN</Text>
                    </Text>
                  )}
                </TouchableOpacity>

                {/* User Profile Avatar Icon Button */}
                <TouchableOpacity
                  style={styles.profileAvatarBtn}
                  activeOpacity={0.7}
                  delayPressIn={0}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
                  onPress={() => setIsProfileModalOpen(true)}
                >
                  {hasValidAvatar ? (
                    <Image
                      source={CHARACTER_IMAGES[avatarKey]}
                      style={styles.headerAvatarImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.headerAvatarInitial}>
                      {(displayName || "P").charAt(0).toUpperCase()}
                    </Text>
                  )}
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
              <TouchableOpacity
                style={styles.actionBox}
                activeOpacity={0.85}
                onPress={onCreateRoom}
              >
                <View style={styles.actionIconPill}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Circle cx="12" cy="12" r="9" stroke="#eab308" strokeWidth="2" />
                    <Path d="M12 8V16M8 12H16" stroke="#eab308" strokeWidth="2" strokeLinecap="round" />
                  </Svg>
                </View>

                <Text style={styles.actionBoxTitle}>CREATE ROOM</Text>
                <Text style={styles.actionBoxSub}>Host Custom Game</Text>

                <View style={styles.actionBoxFooter}>
                  <Text style={[styles.actionBoxLink, { color: "#eab308" }]}>
                    CUSTOM RULES ➔
                  </Text>
                </View>
              </TouchableOpacity>

              {/* JOIN BY CODE */}
              <TouchableOpacity
                style={styles.actionBox}
                activeOpacity={0.85}
                onPress={onJoinRoom}
              >
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
                <Text style={styles.actionBoxSub}>Enter 5-Digit Room Code</Text>

                <View style={styles.actionBoxFooter}>
                  <Text style={[styles.actionBoxLink, { color: "#cbd5e1" }]}>
                    JOIN ROOM ➔
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
              <Text style={styles.sectionSubtitleText}>4 UNIQUE ROLES</Text>
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

        {activeTab === "friends" && <FriendsScreen />}

        {activeTab === "settings" && (
          <SettingsScreen userAlias={displayName} onLogout={handleLogout} onProfileUpdated={onRefresh} />
        )}
      </View>

      {/* Role Details Modal */}
      <ExpandedRoleModal
        role={selectedRole}
        visible={isDossierOpen}
        onClose={() => setIsDossierOpen(false)}
      />

      {/* User Profile Modal (Connected with Dynamic Backend Stats) */}
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
                    {hasValidAvatar ? (
                      <Image
                        source={CHARACTER_IMAGES[avatarKey]}
                        style={styles.modalAvatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.profileAvatarInitial}>
                        {(displayName || "O").charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileAliasName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Text style={styles.profileStatusTag}>VERIFIED PLAYER</Text>
                  </View>
                </View>

                {/* Main Stats Row */}
                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStatBlock}>
                    <Text style={styles.profileStatNumber}>{gamesPlayed}</Text>
                    <Text style={styles.profileStatCaption}>MATCHES</Text>
                  </View>
                  <View style={styles.profileStatBlock}>
                    <Text style={[styles.profileStatNumber, { color: "#22c55e" }]}>{winRate}%</Text>
                    <Text style={styles.profileStatCaption}>WIN RATE</Text>
                  </View>
                  <View style={styles.profileStatBlock}>
                    <Text style={[styles.profileStatNumber, { color: "#eab308" }]}>Lvl {playerLevel}</Text>
                    <Text style={styles.profileStatCaption}>LEVEL</Text>
                  </View>
                </View>

                {/* Role Breakdown Section */}
                <View style={styles.roleBreakdownContainer}>
                  <Text style={styles.roleBreakdownTitle}>WINS BY ROLE</Text>
                  <View style={styles.roleBreakdownGrid}>
                    <View style={styles.roleBreakdownItem}>
                      <Text style={styles.roleBreakdownRole}>MAFIA</Text>
                      <Text style={[styles.roleBreakdownWins, { color: "#f43f5e" }]}>
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
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 28,
  },

  /* Top Bar */
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
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
    backgroundColor: "#1a2232",
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

  /* Quick Play */
  quickPlayCard: {
    backgroundColor: "#dc2626",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  playIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#991b1b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  quickPlayDetails: {
    flex: 1,
  },
  quickPlayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  quickPlayTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  fastMatchTag: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fastMatchTagText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  quickPlaySub: {
    color: "#fee2e2",
    fontSize: 10.5,
    fontWeight: "600",
  },

  /* Action Cards */
  actionsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  actionBox: {
    flex: 1,
    backgroundColor: "#111724",
    borderWidth: 1,
    borderColor: "#1e2638",
    borderRadius: 14,
    padding: 14,
  },
  actionIconPill: {
    marginBottom: 8,
  },
  actionBoxTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  actionBoxSub: {
    color: "#8e9eb5",
    fontSize: 10,
    marginBottom: 10,
  },
  actionBoxFooter: {
    borderTopWidth: 1,
    borderTopColor: "#1a2233",
    paddingTop: 8,
  },
  actionBoxLink: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
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
    marginBottom: 8,
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
});
