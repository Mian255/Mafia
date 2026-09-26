import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import {
  fetchLobbyPlayers,
  fetchRoomSettings,
  kickPlayer,
  leaveRoom,
  setPlayerReady,
  transferHost,
  updateRoomSettings,
} from '../../lib/rooms';
import { CHARACTER_IMAGES, RoleId } from '../../components/RoleCard';
import { useStableCallback } from '../../hooks/useStableCallback';
import type { LobbyPlayer, Room, RoomSettings } from '../../lib/rooms';

interface LobbyScreenProps {
  room: Room;
  currentUserId: string;
  onLeave: () => void;
  onStartGame?: (roomId: string) => void;
}

export default function LobbyScreen({
  room,
  currentUserId,
  onLeave,
  onStartGame,
}: LobbyScreenProps) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room>(room);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isReadying, setIsReadying] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Modals state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LobbyPlayer | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isSavingRules, setIsSavingRules] = useState(false);

  // Editable rules state for host
  const [editMafiaCount, setEditMafiaCount] = useState(1);
  const [editDoctorEnabled, setEditDoctorEnabled] = useState(true);
  const [editDetectiveEnabled, setEditDetectiveEnabled] = useState(true);
  const [editNightDuration, setEditNightDuration] = useState(30);
  const [editDayDuration, setEditDayDuration] = useState(90);

  // Derived state
  const isHost = currentRoom.host_id === currentUserId;
  const currentPlayer = players.find((p) => p.user_id === currentUserId);
  const isReady = currentPlayer?.is_ready ?? false;


  useEffect(() => {
    let isMounted = true;

    const fetchInitial = async () => {
      try {
        const [roster, roomSettings] = await Promise.all([
          fetchLobbyPlayers(currentRoom.id),
          fetchRoomSettings(currentRoom.id),
        ]);
        if (isMounted) {
          setPlayers(roster);
          if (roomSettings) {
            setSettings(roomSettings);
            setEditMafiaCount(roomSettings.mafia_count);
            setEditDoctorEnabled(roomSettings.doctor_enabled);
            setEditDetectiveEnabled(roomSettings.detective_enabled);
            setEditNightDuration(roomSettings.night_duration_seconds);
            setEditDayDuration(roomSettings.discussion_duration_seconds);
          }
          setIsLoading(false);
        }
      } catch {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInitial();

    // 1. Subscribe to changes in room_players
    const playersChannel = supabase
      .channel(`lobby_players:${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        async () => {
          const roster = await fetchLobbyPlayers(currentRoom.id);
          setPlayers(roster);
          // Check if current user was kicked
          const stillInRoom = roster.some((p) => p.user_id === currentUserId);
          if (!stillInRoom) {
            Alert.alert('Removed from Room', 'You were removed from the room by the host.');
            onLeave();
          }
        }
      )
      .subscribe();

    // 2. Subscribe to room changes (host migration, start game, abandoned)
    const roomChannel = supabase
      .channel(`lobby_room:${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${currentRoom.id}`,
        },
        (payload) => {
          const updated = payload.new as Room;
          setCurrentRoom(updated);
          if (updated.status === 'in_progress') {
            onStartGame?.(updated.id);
          } else if (updated.status === 'abandoned') {
            Alert.alert('Room Closed', 'The host has disbanded this room.');
            onLeave();
          }
        }
      )
      .subscribe();

    // 3. Subscribe to room_settings changes
    const settingsChannel = supabase
      .channel(`lobby_settings:${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_settings',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as RoomSettings;
            setSettings(updated);
            setEditMafiaCount(updated.mafia_count);
            setEditDoctorEnabled(updated.doctor_enabled);
            setEditDetectiveEnabled(updated.detective_enabled);
            setEditNightDuration(updated.night_duration_seconds);
            setEditDayDuration(updated.discussion_duration_seconds);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [currentRoom.id, currentUserId, onLeave, onStartGame]);

  const handleCopyCode = useCallback(() => {
    Clipboard.setString(currentRoom.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentRoom.code]);

  const handleToggleReady = useStableCallback(async () => {
    if (isReadying) return;
    setIsReadying(true);
    try {
      const nextReady = !isReady;
      await setPlayerReady(currentRoom.id, nextReady);
      setPlayers((prev) =>
        prev.map((p) => (p.user_id === currentUserId ? { ...p, is_ready: nextReady } : p))
      );
    } catch {
      // ignore
    } finally {
      setIsReadying(false);
    }
  });

  const confirmLeaveRoom = useStableCallback(async () => {
    setIsLeaveModalOpen(false);
    try {
      await leaveRoom(currentRoom.id, isHost);
    } catch {
      // ignore
    }
    onLeave();
  });

  const handleTransferHost = useStableCallback(async (target: LobbyPlayer) => {
    try {
      await transferHost(currentRoom.id, currentUserId, target.user_id);
      setSelectedPlayer(null);
      setCurrentRoom((prev) => ({ ...prev, host_id: target.user_id }));
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          is_host: p.user_id === target.user_id,
        }))
      );
      Alert.alert('Host Changed', `${target.username} is now the host.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to transfer host.');
    }
  });

  const handleKickPlayer = useStableCallback(async (target: LobbyPlayer) => {
    try {
      await kickPlayer(currentRoom.id, target.user_id);
      setSelectedPlayer(null);
      setPlayers((prev) => prev.filter((p) => p.user_id !== target.user_id));
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove player.');
    }
  });

  const handleSaveRules = useStableCallback(async () => {
    if (!isHost || isSavingRules) return;
    setIsSavingRules(true);
    try {
      const updated = await updateRoomSettings(currentRoom.id, {
        mafia_count: editMafiaCount,
        doctor_enabled: editDoctorEnabled,
        detective_enabled: editDetectiveEnabled,
        night_duration_seconds: editNightDuration,
        discussion_duration_seconds: editDayDuration,
      });
      setSettings(updated);
      setIsRulesModalOpen(false);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save rules.');
    } finally {
      setIsSavingRules(false);
    }
  });

  const handleStartGame = useStableCallback(async () => {
    if (!isHost || isStarting) return;

    if (players.length < 4) {
      Alert.alert('Not Enough Players', 'A minimum of 4 players are required to start the game.');
      return;
    }

    const unreadyPlayers = players.filter((p) => !p.is_ready);
    if (unreadyPlayers.length > 0) {
      Alert.alert('Waiting for Players', 'All players must be READY before starting.');
      return;
    }

    setIsStarting(true);
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', currentRoom.id);

      if (error) {
        Alert.alert('Error', error.message || 'Failed to start game.');
      } else {
        onStartGame?.(currentRoom.id);
      }
    } catch {
      Alert.alert('Error', 'Unable to start game. Please try again.');
    } finally {
      setIsStarting(false);
    }
  });

  const canStart = useMemo(
    () => isHost && players.length >= 4 && players.every((p) => p.is_ready),
    [isHost, players]
  );

  const renderPlayerItem = ({ item }: { item: LobbyPlayer }) => {
    const avatarKey = item.avatar_url as RoleId;
    const hasImage = avatarKey && CHARACTER_IMAGES[avatarKey];
    const isMe = item.user_id === currentUserId;

    return (
      <TouchableOpacity
        style={[styles.playerCard, isMe && styles.playerCardMe]}
        onPress={() => {
          if (isHost && !isMe) {
            setSelectedPlayer(item);
          }
        }}
        activeOpacity={isHost && !isMe ? 0.7 : 1}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {hasImage ? (
            <Image source={CHARACTER_IMAGES[avatarKey]} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {(item.username || 'P').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {item.is_host ? (
            <View style={styles.crownBadge}>
              <Text style={styles.crownText}>👑</Text>
            </View>
          ) : null}
        </View>

        {/* Info */}
        <View style={styles.playerInfo}>
          <View style={styles.playerNameRow}>
            <Text style={styles.playerName} numberOfLines={1}>
              {item.username}
            </Text>
            {isMe ? <Text style={styles.youTag}>YOU</Text> : null}
          </View>
          <Text style={styles.playerRoleText}>{item.is_host ? 'Host' : 'Player'}</Text>
        </View>

        {/* Host action hint / Ready badge */}
        {isHost && !isMe ? (
          <View style={styles.managePill}>
            <Text style={styles.managePillText}>MANAGE ▾</Text>
          </View>
        ) : (
          <View
            style={[
              styles.readyBadge,
              item.is_ready ? styles.readyBadgeActive : styles.readyBadgeWaiting,
            ]}
          >
            <Text
              style={[
                styles.readyText,
                item.is_ready ? styles.readyTextActive : styles.readyTextWaiting,
              ]}
            >
              {item.is_ready ? 'READY' : 'WAITING'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setIsLeaveModalOpen(true)}
          style={styles.leaveButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Leave room"
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M16 17l5-5-5-5" stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M21 12H9" stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentRoom.name}
          </Text>
          <Text style={styles.headerSub}>Room Lobby</Text>
        </View>

        {isHost ? (
          <TouchableOpacity
            onPress={() => setIsRulesModalOpen(true)}
            style={styles.settingsButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Circle cx="12" cy="12" r="3" stroke="#94a3b8" strokeWidth={2} />
              <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRightPlaceholder} />
        )}
      </View>

      {/* Room Code Card */}
      <View style={styles.codeCard}>
        <View style={styles.codeHeader}>
          <Text style={styles.codeLabel}>ROOM CODE</Text>
          <TouchableOpacity onPress={handleCopyCode} style={styles.copyBtn} activeOpacity={0.7}>
            <Text style={styles.copyBtnText}>{copied ? 'COPIED! ✓' : 'COPY CODE 📋'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.roomCodeDisplay}>{currentRoom.code}</Text>

        <View style={styles.rosterCountRow}>
          <Text style={styles.rosterCountText}>
            PLAYERS: {players.length} / {currentRoom.max_players}
          </Text>
          <Text style={styles.minReqText}>
            {players.length < 4 ? `(Need ${4 - players.length} more players)` : 'Ready to Start'}
          </Text>
        </View>
      </View>

      {/* Game Rules Summary Pill (Tapping opens rules) */}
      {settings ? (
        <TouchableOpacity
          style={styles.rulesSummaryBar}
          onPress={() => {
            if (isHost) setIsRulesModalOpen(true);
          }}
          activeOpacity={isHost ? 0.7 : 1}
        >
          <Text style={styles.rulesSummaryText}>
            🎭 {settings.mafia_count} Mafia • 🔍 {settings.detective_enabled ? 'Detective' : 'No Detective'} • 💉 {settings.doctor_enabled ? 'Doctor' : 'No Doctor'}
          </Text>
          {isHost ? <Text style={styles.rulesEditText}>EDIT RULES ⚙️</Text> : null}
        </TouchableOpacity>
      ) : null}

      {/* Players List */}
      <View style={styles.rosterContainer}>
        <Text style={styles.rosterSectionTitle}>PLAYERS</Text>

        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#e11d48" size="large" />
          </View>
        ) : (
          <FlatList
            data={players}
            keyExtractor={(item) => item.id}
            renderItem={renderPlayerItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Footer Controls */}
      <View style={styles.footer}>
        {isHost ? (
          <TouchableOpacity
            style={[styles.startButton, !canStart && styles.startDisabled]}
            onPress={handleStartGame}
            disabled={!canStart || isStarting}
            activeOpacity={0.85}
          >
            {isStarting ? (
              <ActivityIndicator color="#ffffff" size="small" style={{ marginRight: 8 }} />
            ) : null}
            <Text style={styles.startButtonText}>
              {players.length < 4
                ? 'WAITING FOR PLAYERS (MIN 4)'
                : !players.every((p) => p.is_ready)
                  ? 'WAITING FOR ALL READY'
                  : 'START GAME 🚀'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.readyButton, isReady && styles.readyButtonActive]}
            onPress={handleToggleReady}
            disabled={isReadying}
            activeOpacity={0.85}
          >
            {isReadying ? (
              <ActivityIndicator color="#ffffff" size="small" style={{ marginRight: 8 }} />
            ) : null}
            <Text style={styles.readyButtonText}>
              {isReady ? 'CANCEL READY ✕' : 'CONFIRM READY ✓'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL 1: Custom Leave Room Confirmation */}
      <Modal visible={isLeaveModalOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setIsLeaveModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Leave the Room?</Text>
                <Text style={styles.modalBody}>
                  {isHost
                    ? 'Leaving as host will make another player the host or close the room. You will return to the Home screen.'
                    : 'Are you sure you want to leave this room? You will return to the Home screen.'}
                </Text>

                <View style={styles.modalButtonRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setIsLeaveModalOpen(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCancelText}>STAY</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalConfirmBtn}
                    onPress={confirmLeaveRoom}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalConfirmText}>LEAVE ROOM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL 2: Host Controls for Selected Player */}
      <Modal visible={!!selectedPlayer} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setSelectedPlayer(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{selectedPlayer?.username}</Text>
                <Text style={styles.modalSub}>Host Controls for this player</Text>

                <TouchableOpacity
                  style={styles.actionRowBtn}
                  onPress={() => selectedPlayer && handleTransferHost(selectedPlayer)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionRowBtnEmoji}>👑</Text>
                  <Text style={styles.actionRowBtnText}>Make Host</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionRowBtn, styles.actionRowDanger]}
                  onPress={() => selectedPlayer && handleKickPlayer(selectedPlayer)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionRowBtnEmoji}>🚫</Text>
                  <Text style={[styles.actionRowBtnText, { color: '#f43f5e' }]}>
                    Remove from Room
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setSelectedPlayer(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCloseText}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL 3: Host Edit Game Rules */}
      <Modal visible={isRulesModalOpen} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setIsRulesModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, styles.rulesModalCard]}>
                <Text style={styles.modalTitle}>Game Rules & Roles</Text>
                <Text style={styles.modalSub}>Configure settings for this room</Text>

                <ScrollView style={styles.rulesScrollView} showsVerticalScrollIndicator={false}>
                  {/* Mafia Count */}
                  <View style={styles.ruleBlock}>
                    <Text style={styles.ruleLabel}>Mafia Count: {editMafiaCount}</Text>
                    <View style={styles.timerSelector}>
                      {[1, 2, 3, 4].map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[styles.timePill, editMafiaCount === n && styles.timePillActive]}
                          onPress={() => setEditMafiaCount(n)}
                        >
                          <Text style={[styles.timePillText, editMafiaCount === n && styles.timePillTextActive]}>
                            {n} Mafia
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Doctor Role */}
                  <View style={styles.ruleSwitchRow}>
                    <Text style={styles.ruleSwitchLabel}>Enable Doctor Role</Text>
                    <Switch
                      value={editDoctorEnabled}
                      onValueChange={setEditDoctorEnabled}
                      thumbColor={editDoctorEnabled ? '#10b981' : '#64748b'}
                      trackColor={{ false: '#1e293b', true: '#047857' }}
                    />
                  </View>

                  {/* Detective Role */}
                  <View style={styles.ruleSwitchRow}>
                    <Text style={styles.ruleSwitchLabel}>Enable Detective Role</Text>
                    <Switch
                      value={editDetectiveEnabled}
                      onValueChange={setEditDetectiveEnabled}
                      thumbColor={editDetectiveEnabled ? '#0ea5e9' : '#64748b'}
                      trackColor={{ false: '#1e293b', true: '#0369a1' }}
                    />
                  </View>

                  {/* Timers */}
                  <View style={styles.ruleBlock}>
                    <Text style={styles.ruleLabel}>Day Discussion Time</Text>
                    <View style={styles.timerSelector}>
                      {[60, 90, 120].map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.timePill, editDayDuration === t && styles.timePillActive]}
                          onPress={() => setEditDayDuration(t)}
                        >
                          <Text style={[styles.timePillText, editDayDuration === t && styles.timePillTextActive]}>
                            {t}s
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.ruleBlock}>
                    <Text style={styles.ruleLabel}>Night Phase Time</Text>
                    <View style={styles.timerSelector}>
                      {[20, 30, 45].map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.timePill, editNightDuration === t && styles.timePillActive]}
                          onPress={() => setEditNightDuration(t)}
                        >
                          <Text style={[styles.timePillText, editNightDuration === t && styles.timePillTextActive]}>
                            {t}s
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.modalButtonRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setIsRulesModalOpen(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCancelText}>CANCEL</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, isSavingRules && { opacity: 0.6 }]}
                    onPress={handleSaveRules}
                    disabled={isSavingRules}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalConfirmText}>
                      {isSavingRules ? 'SAVING...' : 'SAVE RULES'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#0c1017',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  leaveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleGroup: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightPlaceholder: {
    width: 40,
  },
  codeCard: {
    backgroundColor: '#0f172a',
    margin: 20,
    marginBottom: 8,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  copyBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
  roomCodeDisplay: {
    fontSize: 36,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 8,
    marginVertical: 4,
  },
  rosterCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
  },
  rosterCountText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  minReqText: {
    color: '#e11d48',
    fontSize: 12,
    fontWeight: '700',
  },
  rulesSummaryBar: {
    backgroundColor: '#0c1017',
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rulesSummaryText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  rulesEditText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 6,
  },
  rosterContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  rosterSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    marginVertical: 10,
  },
  listContent: {
    paddingBottom: 20,
  },
  playerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  playerCardMe: {
    borderColor: '#38bdf8',
    backgroundColor: '#101c36',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  crownBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#07090e',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownText: {
    fontSize: 11,
  },
  playerInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    marginRight: 6,
  },
  youTag: {
    backgroundColor: '#38bdf8',
    color: '#07090e',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  playerRoleText: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  managePill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  managePillText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
  },
  readyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  readyBadgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  readyBadgeWaiting: {
    backgroundColor: '#1e293b',
  },
  readyText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  readyTextActive: {
    color: '#34d399',
  },
  readyTextWaiting: {
    color: '#94a3b8',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
    backgroundColor: '#0c1017',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  startButton: {
    backgroundColor: '#e11d48',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  startDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
    elevation: 0,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  readyButton: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  readyButtonActive: {
    backgroundColor: '#e11d48',
  },
  readyButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  rulesModalCard: {
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  modalBody: {
    fontSize: 14,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 20,
    marginVertical: 14,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#94a3b8',
    fontWeight: '800',
    fontSize: 13,
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#e11d48',
    paddingVertical: 14,
    borderRadius: 12,
    marginLeft: 8,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  actionRowBtn: {
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionRowDanger: {
    borderColor: 'rgba(244, 63, 94, 0.4)',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  actionRowBtnEmoji: {
    fontSize: 18,
    marginRight: 10,
  },
  actionRowBtnText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  modalCloseBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  modalCloseText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  rulesScrollView: {
    maxHeight: 300,
    marginVertical: 6,
  },
  ruleBlock: {
    marginBottom: 14,
  },
  ruleLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  ruleSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  ruleSwitchLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  timerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timePill: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  timePillActive: {
    backgroundColor: '#3b82f6',
  },
  timePillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  timePillTextActive: {
    color: '#ffffff',
  },
});
