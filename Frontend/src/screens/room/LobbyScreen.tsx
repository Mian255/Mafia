import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import VoiceBar from '../../components/VoiceBar';
import {
  addBotToRoom,
  fetchLobbyPlayers,
  fetchRoomSettings,
  fetchUserFriends,
  kickPlayer,
  leaveRoom,
  removeBotFromRoom,
  setPlayerReady,
  transferHost,
  updateRoomSettings,
} from '../../lib/rooms';
import { CHARACTER_IMAGES, RoleId } from '../../components/RoleCard';
import { startGame } from '../../lib/games';
import { useStableCallback } from '../../hooks/useStableCallback';
import type { LobbyFriendItem, LobbyPlayer, Room, RoomSettings } from '../../lib/rooms';

interface LobbyScreenProps {
  room: Room;
  currentUserId: string;
  onLeave: () => void;
  onStartGame?: (roomId: string) => void;
}

const BOT_NAMES = [
  'Bot Vito',
  'Bot Scarlett',
  'Bot Sherlock',
  'Bot Dominic',
  'Bot Luca',
  'Bot Sonny',
  'Bot Clemenza',
  'Bot Isabella',
  'Bot Frankie',
  'Bot Vincent',
  'Bot Watson',
  'Bot Tessio',
];

const BOT_AVATARS: RoleId[] = ['mafia', 'detective', 'doctor', 'civilian'];

interface PlayerRowProps {
  item: LobbyPlayer;
  isMe: boolean;
  isHost: boolean;
  onManage: (player: LobbyPlayer) => void;
}

// Memoized so individual rows skip re-render when the lobby re-renders for
// unrelated state (copied toggle, modal open/close, ready spinner, etc.).
const PlayerRow = React.memo(function PlayerRow({
  item,
  isMe,
  isHost,
  onManage,
}: PlayerRowProps) {
  const avatarKey = (item.avatar_url as RoleId) || 'civilian';
  const hasImage = avatarKey && CHARACTER_IMAGES[avatarKey];

  return (
    <TouchableOpacity
      style={[
        styles.playerCard,
        isMe && styles.playerCardMe,
        item.is_bot && styles.playerCardBot,
      ]}
      onPress={() => {
        if (isHost && !isMe) {
          onManage(item);
        }
      }}
      activeOpacity={isHost && !isMe ? 0.7 : 1}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {hasImage ? (
          <Image
            source={CHARACTER_IMAGES[avatarKey]}
            style={styles.avatarImg}
            resizeMode="cover"
          />
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
        {item.is_bot ? (
          <View style={styles.botBadge}>
            <Text style={styles.botBadgeText}>🤖</Text>
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
          {item.is_bot ? <Text style={styles.botTag}>BOT</Text> : null}
        </View>
        <Text style={styles.playerRoleText}>
          {item.is_host ? 'Host' : item.is_bot ? 'AI Player' : 'Player'}
        </Text>
      </View>

      {/* Host action hint / Ready badge */}
      {isHost && !isMe ? (
        <View style={styles.managePill}>
          <Text style={styles.managePillText}>
            {item.is_bot ? 'REMOVE ✕' : 'MANAGE ▾'}
          </Text>
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
});

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
  const [isAddingBot, setIsAddingBot] = useState(false);

  // Modals state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LobbyPlayer | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isSavingRules, setIsSavingRules] = useState(false);

  // Invite friends modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [friendsList, setFriendsList] = useState<LobbyFriendItem[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [invitedFriends, setInvitedFriends] = useState<Set<string>>(new Set());

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

  // Refs so the realtime effect can stay subscribed once per room without
  // re-subscribing on prop/host/modal changes, and to guard async setState.
  const onLeaveRef = useRef(onLeave);
  const onStartGameRef = useRef(onStartGame);
  const isHostRef = useRef(isHost);
  const isRulesModalOpenRef = useRef(isRulesModalOpen);
  const isMountedRef = useRef(true);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onLeaveRef.current = onLeave;
    onStartGameRef.current = onStartGame;
    isHostRef.current = isHost;
    isRulesModalOpenRef.current = isRulesModalOpen;
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    };
  }, []);

  // Max allowed mafia for fair game in in-lobby rules editor
  const maxAllowedMafiaInRules = useMemo(() => {
    const specialRoles = (editDoctorEnabled ? 1 : 0) + (editDetectiveEnabled ? 1 : 0);
    const halfLimit = Math.floor((currentRoom.max_players - 1) / 2);
    const roomLimit = currentRoom.max_players - specialRoles - 1;
    return Math.max(1, Math.min(halfLimit, roomLimit));
  }, [currentRoom.max_players, editDoctorEnabled, editDetectiveEnabled]);

  const effectiveEditMafiaCount = Math.min(Math.max(1, editMafiaCount), maxAllowedMafiaInRules);

  // Derived civilian count in rules modal
  const editCivilianCount = useMemo(() => {
    return Math.max(
      1,
      currentRoom.max_players -
        effectiveEditMafiaCount -
        (editDoctorEnabled ? 1 : 0) -
        (editDetectiveEnabled ? 1 : 0)
    );
  }, [currentRoom.max_players, effectiveEditMafiaCount, editDoctorEnabled, editDetectiveEnabled]);

  // Clamp the raw mafia count into state when the allowed maximum shrinks
  // (e.g. after toggling a role) so the stepper does not appear stuck.
  useEffect(() => {
    // Intentional: clamp the user-editable mafia count back into range when the
    // allowed maximum shrinks (e.g. after toggling a role) so the stepper isn't stuck.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditMafiaCount((prev) => {
      const clamped = Math.min(Math.max(1, prev), maxAllowedMafiaInRules);
      return clamped === prev ? prev : clamped;
    });
  }, [maxAllowedMafiaInRules]);

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
          if (!isMounted) return;
          setPlayers(roster);
          // Check if current user was kicked (only for human players)
          const stillInRoom = roster.some((p) => p.user_id === currentUserId);
          if (!stillInRoom && !isHostRef.current) {
            Alert.alert('Removed from Room', 'You were removed from the room by the host.');
            onLeaveRef.current();
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
            onStartGameRef.current?.(updated.id);
          } else if (updated.status === 'abandoned') {
            Alert.alert('Room Closed', 'The host has disbanded this room.');
            onLeaveRef.current();
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
            // Do not clobber in-progress rule edits while the host has the
            // rules modal open — only sync the display state above.
            if (!isRulesModalOpenRef.current) {
              setEditMafiaCount(updated.mafia_count);
              setEditDoctorEnabled(updated.doctor_enabled);
              setEditDetectiveEnabled(updated.detective_enabled);
              setEditNightDuration(updated.night_duration_seconds);
              setEditDayDuration(updated.discussion_duration_seconds);
            }
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
  }, [currentRoom.id, currentUserId]);

  // If the currently managed player leaves or is kicked (via realtime), close
  // the manage modal so we do not act on a departed row.
  useEffect(() => {
    if (selectedPlayer && !players.some((p) => p.id === selectedPlayer.id)) {
      // Intentional: close the manage modal when its target player has left/been kicked.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlayer(null);
    }
  }, [players, selectedPlayer]);

  // Reset the "copied invite" markers whenever the invite modal opens/closes or
  // the room changes, so the copied state is not sticky across sessions.
  useEffect(() => {
    // Intentional: reset the "copied" set when the invite modal opens/closes or the room changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvitedFriends(new Set());
  }, [isInviteModalOpen, currentRoom.id]);

  const handleCopyCode = useCallback(async () => {
    await Clipboard.setStringAsync(currentRoom.code);
    if (!isMountedRef.current) return;
    setCopied(true);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopied(false);
    }, 2000);
  }, [currentRoom.code]);

  const handleOpenInviteModal = useStableCallback(async () => {
    setIsInviteModalOpen(true);
    setIsLoadingFriends(true);
    try {
      const friends = await fetchUserFriends();
      setFriendsList(friends);
    } catch {
      setFriendsList([]);
    } finally {
      setIsLoadingFriends(false);
    }
  });

  const handleInviteFriend = useStableCallback(async (friend: LobbyFriendItem) => {
    const inviteMessage = `Join my Mafia game room! Room Code: ${currentRoom.code}`;
    await Clipboard.setStringAsync(inviteMessage);
    setInvitedFriends((prev) => new Set(prev).add(friend.id));
    Alert.alert(
      'Invite Copied',
      `Room invite copied to clipboard for ${friend.username}! Send it directly or in chat.`
    );
  });

  const handleShareGeneral = useCallback(async () => {
    const inviteMessage = `Join my Mafia room! Enter Code: ${currentRoom.code}`;
    await Clipboard.setStringAsync(inviteMessage);
    Alert.alert('Room Code Copied', `"${currentRoom.code}" copied to clipboard.`);
  }, [currentRoom.code]);

  const handleAddBot = useStableCallback(async () => {
    if (!isHost || isAddingBot) return;
    if (players.length >= currentRoom.max_players) {
      Alert.alert('Room Full', `Maximum player capacity of ${currentRoom.max_players} reached.`);
      return;
    }

    setIsAddingBot(true);
    try {
      // Pick next unused bot name
      const existingNames = new Set(players.map((p) => p.username));
      const availableName =
        BOT_NAMES.find((name) => !existingNames.has(name)) ||
        `Bot ${Math.floor(100 + Math.random() * 900)}`;

      const randomAvatar = BOT_AVATARS[players.length % BOT_AVATARS.length];

      await addBotToRoom(currentRoom.id, availableName, randomAvatar);
      const roster = await fetchLobbyPlayers(currentRoom.id);
      if (!isMountedRef.current) return;
      setPlayers(roster);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add bot.');
      }
    } finally {
      if (isMountedRef.current) setIsAddingBot(false);
    }
  });

  const handleFillBotsToMin = useStableCallback(async () => {
    if (!isHost || isAddingBot) return;
    const needed = Math.max(0, 4 - players.length);
    if (needed === 0) return;

    setIsAddingBot(true);
    try {
      for (let i = 0; i < needed; i++) {
        const currentRoster = await fetchLobbyPlayers(currentRoom.id);
        const existingNames = new Set(currentRoster.map((p) => p.username));
        const availableName =
          BOT_NAMES.find((name) => !existingNames.has(name)) ||
          `Bot ${Math.floor(100 + Math.random() * 900)}`;
        const randomAvatar = BOT_AVATARS[(currentRoster.length + i) % BOT_AVATARS.length];
        await addBotToRoom(currentRoom.id, availableName, randomAvatar);
      }
      const updated = await fetchLobbyPlayers(currentRoom.id);
      if (!isMountedRef.current) return;
      setPlayers(updated);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add bots.');
      }
    } finally {
      if (isMountedRef.current) setIsAddingBot(false);
    }
  });

  const handleToggleReady = useStableCallback(async () => {
    if (isReadying) return;
    setIsReadying(true);
    try {
      const nextReady = !isReady;
      await setPlayerReady(currentRoom.id, nextReady);
      if (!isMountedRef.current) return;
      setPlayers((prev) =>
        prev.map((p) => (p.user_id === currentUserId ? { ...p, is_ready: nextReady } : p))
      );
    } catch {
      // ignore
    } finally {
      if (isMountedRef.current) setIsReadying(false);
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
    if (target.is_bot || !target.user_id) {
      Alert.alert('Invalid Action', 'Bots cannot be made room host.');
      return;
    }
    try {
      await transferHost(currentRoom.id, currentUserId, target.user_id);
      if (!isMountedRef.current) return;
      setSelectedPlayer(null);
      setCurrentRoom((prev) => ({ ...prev, host_id: target.user_id! }));
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          is_host: p.user_id === target.user_id,
        }))
      );
      Alert.alert('Host Changed', `${target.username} is now the host.`);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to transfer host.');
      }
    }
  });

  const handleKickPlayer = useStableCallback(async (target: LobbyPlayer) => {
    try {
      if (target.is_bot) {
        await removeBotFromRoom(currentRoom.id, target.id);
      } else {
        await kickPlayer(currentRoom.id, target.user_id, target.id);
      }
      if (!isMountedRef.current) return;
      setSelectedPlayer(null);
      setPlayers((prev) => prev.filter((p) => p.id !== target.id));
    } catch (err: unknown) {
      if (isMountedRef.current) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove player.');
      }
    }
  });

  const handleSaveRules = useStableCallback(async () => {
    if (!isHost || isSavingRules) return;
    setIsSavingRules(true);
    try {
      const updated = await updateRoomSettings(currentRoom.id, {
        mafia_count: effectiveEditMafiaCount,
        doctor_enabled: editDoctorEnabled,
        detective_enabled: editDetectiveEnabled,
        night_duration_seconds: editNightDuration,
        discussion_duration_seconds: editDayDuration,
      });
      if (!isMountedRef.current) return;
      setSettings(updated);
      setIsRulesModalOpen(false);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save rules.');
      }
    } finally {
      if (isMountedRef.current) setIsSavingRules(false);
    }
  });

  const handleStartGame = useStableCallback(async () => {
    if (!isHost || isStarting) return;

    if (players.length < 4) {
      Alert.alert('Not Enough Players', 'A minimum of 4 players are required to start the game. You can add bots to fill the lobby.');
      return;
    }

    const unreadyPlayers = players.filter((p) => !p.is_ready);
    if (unreadyPlayers.length > 0) {
      Alert.alert('Waiting for Players', 'All human players must be READY before starting.');
      return;
    }

    setIsStarting(true);
    try {
      // Atomic server-side start: start_game seats players, assigns roles, and
      // flips rooms.status='in_progress' under host authorization. The realtime
      // rooms handler above then fires onStartGame for every client; we also
      // navigate the host directly here so it feels instant.
      await startGame(currentRoom.id);
      if (!isMountedRef.current) return;
      onStartGameRef.current?.(currentRoom.id);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Unable to start game. Please try again.');
      }
    } finally {
      if (isMountedRef.current) setIsStarting(false);
    }
  });

  const canStart = useMemo(
    () => isHost && players.length >= 4 && players.every((p) => p.is_ready),
    [isHost, players]
  );

  const handleSelectPlayer = useStableCallback((player: LobbyPlayer) => {
    setSelectedPlayer(player);
  });

  const renderPlayerItem = useCallback(
    ({ item }: { item: LobbyPlayer }) => (
      <PlayerRow
        item={item}
        isMe={item.user_id === currentUserId}
        isHost={isHost}
        onManage={handleSelectPlayer}
      />
    ),
    [currentUserId, isHost, handleSelectPlayer]
  );

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
            <Path
              d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
              stroke="#f43f5e"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M16 17l5-5-5-5"
              stroke="#f43f5e"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M21 12H9"
              stroke="#f43f5e"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
              <Path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRightPlaceholder} />
        )}
      </View>

      {/* Lobby voice (MAF-072): everyone in the room can chat by voice. */}
      <View style={styles.voiceWrap}>
        <VoiceBar channel="lobby" ids={{ roomId: currentRoom.id }} />
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
          <Text style={[styles.minReqText, players.length >= 4 && styles.minReqTextSuccess]}>
            {players.length < 4
              ? `(Need ${4 - players.length} more players)`
              : 'Minimum Met (Ready to Start)'}
          </Text>
        </View>
      </View>

      {/* Action Bar: Invite Friends & Add Bots */}
      <View style={styles.lobbyActionsRow}>
        <TouchableOpacity
          style={styles.lobbyActionBtn}
          onPress={handleOpenInviteModal}
          activeOpacity={0.8}
        >
          <Text style={styles.lobbyActionBtnText}>👥 INVITE FRIENDS</Text>
        </TouchableOpacity>

        {isHost && players.length < currentRoom.max_players ? (
          <TouchableOpacity
            style={[styles.lobbyActionBtn, styles.lobbyActionBtnBot]}
            onPress={handleAddBot}
            disabled={isAddingBot}
            activeOpacity={0.8}
          >
            {isAddingBot ? (
              <ActivityIndicator color="#38bdf8" size="small" style={{ marginRight: 4 }} />
            ) : null}
            <Text style={[styles.lobbyActionBtnText, { color: '#38bdf8' }]}>+ ADD BOT 🤖</Text>
          </TouchableOpacity>
        ) : null}

        {isHost && players.length < 4 ? (
          <TouchableOpacity
            style={[styles.lobbyActionBtn, styles.lobbyActionBtnFill]}
            onPress={handleFillBotsToMin}
            disabled={isAddingBot}
            activeOpacity={0.8}
          >
            <Text style={[styles.lobbyActionBtnText, { color: '#f59e0b' }]}>⚡ AUTO-FILL (4)</Text>
          </TouchableOpacity>
        ) : null}
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
            🎭 {settings.mafia_count} Mafia • 🔍{' '}
            {settings.detective_enabled ? 'Detective' : 'No Detective'} • 💉{' '}
            {settings.doctor_enabled ? 'Doctor' : 'No Doctor'}
          </Text>
          {isHost ? <Text style={styles.rulesEditText}>EDIT RULES ⚙️</Text> : null}
        </TouchableOpacity>
      ) : null}

      {/* Players List */}
      <View style={styles.rosterContainer}>
        <View style={styles.rosterHeaderRow}>
          <Text style={styles.rosterSectionTitle}>PLAYERS IN ROOM ({players.length})</Text>
          {players.some((p) => p.is_bot) ? (
            <Text style={styles.botCountSubtitle}>
              {players.filter((p) => p.is_bot).length} Bots active
            </Text>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#e11d48" size="large" />
          </View>
        ) : (
          <FlatList
            data={players}
            keyExtractor={(item) => item.id}
            renderItem={renderPlayerItem}
            extraData={isHost}
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

      {/* MODAL 2: Host Controls for Selected Player / Bot */}
      <Modal visible={!!selectedPlayer} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setSelectedPlayer(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{selectedPlayer?.username}</Text>
                <Text style={styles.modalSub}>
                  {selectedPlayer?.is_bot ? 'AI Bot Player' : 'Player Management'}
                </Text>

                {!selectedPlayer?.is_bot && (
                  <TouchableOpacity
                    style={styles.actionRowBtn}
                    onPress={() => selectedPlayer && handleTransferHost(selectedPlayer)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionRowBtnEmoji}>👑</Text>
                    <Text style={styles.actionRowBtnText}>Make Host</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.actionRowBtn, styles.actionRowDanger]}
                  onPress={() => selectedPlayer && handleKickPlayer(selectedPlayer)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionRowBtnEmoji}>🚫</Text>
                  <Text style={[styles.actionRowBtnText, { color: '#f43f5e' }]}>
                    {selectedPlayer?.is_bot ? 'Remove Bot from Room' : 'Remove from Room'}
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

      {/* MODAL 3: Invite Friends Modal */}
      <Modal visible={isInviteModalOpen} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setIsInviteModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, styles.inviteModalCard]}>
                <Text style={styles.modalTitle}>Invite Friends</Text>
                <Text style={styles.modalSub}>Share Room Code with your friends</Text>

                {/* Quick Code Share Banner */}
                <View style={styles.inviteCodeBox}>
                  <View>
                    <Text style={styles.inviteCodeLabel}>ROOM CODE</Text>
                    <Text style={styles.inviteCodeVal}>{currentRoom.code}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.inviteShareBtn}
                    onPress={handleShareGeneral}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.inviteShareBtnText}>COPY LINK 📋</Text>
                  </TouchableOpacity>
                </View>

                {/* Friends List */}
                <Text style={styles.friendsSectionHeader}>YOUR FRIENDS</Text>
                {isLoadingFriends ? (
                  <View style={{ paddingVertical: 20 }}>
                    <ActivityIndicator color="#38bdf8" />
                  </View>
                ) : friendsList.length === 0 ? (
                  <View style={styles.emptyFriendsBox}>
                    <Text style={styles.emptyFriendsText}>
                      No friends found yet. Share your Room Code directly to invite players!
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={styles.friendsScrollView} showsVerticalScrollIndicator={false}>
                    {friendsList.map((f) => {
                      const isInvited = invitedFriends.has(f.id);
                      return (
                        <View key={f.id} style={styles.friendRow}>
                          <View style={styles.friendInfo}>
                            <View style={styles.friendAvatar}>
                              <Text style={styles.friendAvatarInitial}>
                                {f.username.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.friendName} numberOfLines={1}>
                              {f.username}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[styles.friendInviteBtn, isInvited && styles.friendInvitedBtn]}
                            onPress={() => handleInviteFriend(f)}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.friendInviteBtnText,
                                isInvited && styles.friendInvitedBtnText,
                              ]}
                            >
                              {isInvited ? 'COPIED ✓' : 'COPY INVITE'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

                <TouchableOpacity
                  style={styles.modalCancelBtnFull}
                  onPress={() => setIsInviteModalOpen(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>DONE</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL 4: Host Edit Game Rules & Role Customization */}
      <Modal visible={isRulesModalOpen} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setIsRulesModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, styles.rulesModalCard]}>
                <Text style={styles.modalTitle}>Game Rules & Roles</Text>
                <Text style={styles.modalSub}>
                  Room Capacity: {currentRoom.max_players} Players
                </Text>

                <ScrollView style={styles.rulesScrollView} showsVerticalScrollIndicator={false}>
                  {/* Fair Role Distribution Summary */}
                  <View style={styles.ruleSummaryGrid}>
                    <View style={[styles.rulePill, { borderColor: '#e11d48' }]}>
                      <Text style={[styles.rulePillCount, { color: '#e11d48' }]}>
                        {effectiveEditMafiaCount}
                      </Text>
                      <Text style={styles.rulePillName}>Mafia</Text>
                    </View>

                    <View style={[styles.rulePill, { borderColor: '#0ea5e9' }]}>
                      <Text style={[styles.rulePillCount, { color: '#0ea5e9' }]}>
                        {editDetectiveEnabled ? 1 : 0}
                      </Text>
                      <Text style={styles.rulePillName}>Detective</Text>
                    </View>

                    <View style={[styles.rulePill, { borderColor: '#10b981' }]}>
                      <Text style={[styles.rulePillCount, { color: '#10b981' }]}>
                        {editDoctorEnabled ? 1 : 0}
                      </Text>
                      <Text style={styles.rulePillName}>Doctor</Text>
                    </View>

                    <View style={[styles.rulePill, { borderColor: '#94a3b8' }]}>
                      <Text style={[styles.rulePillCount, { color: '#94a3b8' }]}>
                        {editCivilianCount}
                      </Text>
                      <Text style={styles.rulePillName}>Civilians</Text>
                    </View>
                  </View>

                  {/* Mafia Stepper */}
                  <View style={styles.ruleBlock}>
                    <View style={styles.ruleBlockHeader}>
                      <Text style={styles.ruleLabel}>Mafia Count: {effectiveEditMafiaCount}</Text>
                      <Text style={styles.ruleCapNote}>Max: {maxAllowedMafiaInRules}</Text>
                    </View>

                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={[styles.stepperSubBtn, effectiveEditMafiaCount <= 1 && styles.stepperDisabled]}
                        onPress={() => setEditMafiaCount(Math.max(1, effectiveEditMafiaCount - 1))}
                        disabled={effectiveEditMafiaCount <= 1}
                      >
                        <Text style={styles.stepperSubBtnText}>-</Text>
                      </TouchableOpacity>

                      <Text style={styles.stepperSubValue}>{effectiveEditMafiaCount} Mafia</Text>

                      <TouchableOpacity
                        style={[
                          styles.stepperSubBtn,
                          effectiveEditMafiaCount >= maxAllowedMafiaInRules && styles.stepperDisabled,
                        ]}
                        onPress={() =>
                          setEditMafiaCount(
                            Math.min(maxAllowedMafiaInRules, effectiveEditMafiaCount + 1)
                          )
                        }
                        disabled={effectiveEditMafiaCount >= maxAllowedMafiaInRules}
                      >
                        <Text style={styles.stepperSubBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Doctor Role */}
                  <View style={styles.ruleSwitchRow}>
                    <View>
                      <Text style={styles.ruleSwitchLabel}>Doctor Role</Text>
                      <Text style={styles.ruleSwitchSub}>Protects innocent player</Text>
                    </View>
                    <Switch
                      value={editDoctorEnabled}
                      onValueChange={setEditDoctorEnabled}
                      thumbColor={editDoctorEnabled ? '#10b981' : '#64748b'}
                      trackColor={{ false: '#1e293b', true: '#047857' }}
                    />
                  </View>

                  {/* Detective Role */}
                  <View style={styles.ruleSwitchRow}>
                    <View>
                      <Text style={styles.ruleSwitchLabel}>Detective Role</Text>
                      <Text style={styles.ruleSwitchSub}>Investigates nightly suspect</Text>
                    </View>
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
                          style={[
                            styles.timePill,
                            editDayDuration === t && styles.timePillActive,
                          ]}
                          onPress={() => setEditDayDuration(t)}
                        >
                          <Text
                            style={[
                              styles.timePillText,
                              editDayDuration === t && styles.timePillTextActive,
                            ]}
                          >
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
                          style={[
                            styles.timePill,
                            editNightDuration === t && styles.timePillActive,
                          ]}
                          onPress={() => setEditNightDuration(t)}
                        >
                          <Text
                            style={[
                              styles.timePillText,
                              editNightDuration === t && styles.timePillTextActive,
                            ]}
                          >
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
  voiceWrap: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
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
    marginHorizontal: 20,
    marginTop: 16,
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
    marginBottom: 4,
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
    fontSize: 34,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 8,
    marginVertical: 4,
  },
  rosterCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 6,
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
  minReqTextSuccess: {
    color: '#10b981',
  },
  lobbyActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 8,
    gap: 8,
  },
  lobbyActionBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#334155',
  },
  lobbyActionBtnBot: {
    borderColor: 'rgba(56, 189, 248, 0.3)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  lobbyActionBtnFill: {
    borderColor: 'rgba(245, 158, 11, 0.3)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    flex: 0.9,
  },
  lobbyActionBtnText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rulesSummaryBar: {
    backgroundColor: '#0c1017',
    marginHorizontal: 20,
    marginBottom: 8,
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
  rosterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  rosterSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  botCountSubtitle: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
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
  playerCardBot: {
    borderColor: '#334155',
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
  botBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#0c1017',
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botBadgeText: {
    fontSize: 10,
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
  botTag: {
    backgroundColor: '#334155',
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 1,
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
    maxHeight: '85%',
  },
  inviteModalCard: {
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
  modalCancelBtnFull: {
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
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
    maxHeight: 340,
    marginVertical: 6,
  },
  ruleSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rulePill: {
    flex: 1,
    backgroundColor: '#07090e',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  rulePillCount: {
    fontSize: 16,
    fontWeight: '900',
  },
  rulePillName: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
    marginTop: 2,
  },
  ruleBlock: {
    marginBottom: 14,
  },
  ruleBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ruleLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  ruleCapNote: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#07090e',
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  stepperSubBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSubBtnText: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
  },
  stepperSubValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  stepperDisabled: {
    opacity: 0.3,
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
  ruleSwitchSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  timerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
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
  inviteCodeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#07090e',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 14,
  },
  inviteCodeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  inviteCodeVal: {
    fontSize: 20,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 3,
  },
  inviteShareBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inviteShareBtnText: {
    color: '#07090e',
    fontWeight: '900',
    fontSize: 11,
  },
  friendsSectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyFriendsBox: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#07090e',
    borderRadius: 10,
    alignItems: 'center',
  },
  emptyFriendsText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  friendsScrollView: {
    maxHeight: 200,
  },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  friendAvatarInitial: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 'bold',
  },
  friendName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  friendInviteBtn: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  friendInvitedBtn: {
    backgroundColor: '#10b981',
  },
  friendInviteBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  friendInvitedBtnText: {
    color: '#ffffff',
  },
});
