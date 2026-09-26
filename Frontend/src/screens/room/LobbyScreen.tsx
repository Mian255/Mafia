import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { fetchLobbyPlayers, leaveRoom, setPlayerReady } from '../../lib/rooms';
import { CHARACTER_IMAGES, RoleId } from '../../components/RoleCard';
import { useStableCallback } from '../../hooks/useStableCallback';
import type { LobbyPlayer, Room } from '../../lib/rooms';

interface LobbyScreenProps {
  room: Room;
  currentUserId: string;
  onLeave: () => void;
  onStartGame?: (roomId: string) => void;
  onOpenSettings?: (roomId: string) => void;
}

export default function LobbyScreen({
  room,
  currentUserId,
  onLeave,
  onStartGame,
  onOpenSettings,
}: LobbyScreenProps) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room>(room);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isReadying, setIsReadying] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Check if current user is the room host
  const isHost = currentRoom.host_id === currentUserId;
  const currentPlayer = players.find((p) => p.user_id === currentUserId);
  const isReady = currentPlayer?.is_ready ?? false;

  const loadPlayers = useCallback(async () => {
    try {
      const roster = await fetchLobbyPlayers(currentRoom.id);
      setPlayers(roster);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [currentRoom.id]);

  useEffect(() => {
    let isMounted = true;

    const fetchInitial = async () => {
      try {
        const roster = await fetchLobbyPlayers(currentRoom.id);
        if (isMounted) {
          setPlayers(roster);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInitial();

    // 1. Subscribe to changes in room_players for this room
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
        () => {
          loadPlayers();
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

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [currentRoom.id, loadPlayers, onLeave, onStartGame]);

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

  const handleLeave = useStableCallback(async () => {
    Alert.alert(
      isHost ? 'Disband Operation?' : 'Leave Operation?',
      isHost
        ? 'Leaving as host will pass command to the next operative or close the room.'
        : 'Are you sure you want to return to headquarters?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveRoom(currentRoom.id, isHost);
            } catch {
              // ignore
            }
            onLeave();
          },
        },
      ]
    );
  });

  const handleStartGame = useStableCallback(async () => {
    if (!isHost || isStarting) return;

    if (players.length < 4) {
      Alert.alert('Not Enough Operatives', 'A minimum of 4 players are required to start the operation.');
      return;
    }

    const unreadyPlayers = players.filter((p) => !p.is_ready);
    if (unreadyPlayers.length > 0) {
      Alert.alert('Awaiting Operatives', 'All operatives must be marked READY before deploying.');
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
      <View style={[styles.playerCard, isMe && styles.playerCardMe]}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {hasImage ? (
            <Image source={CHARACTER_IMAGES[avatarKey]} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {(item.username || 'O').charAt(0).toUpperCase()}
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
          <Text style={styles.playerRoleText}>{item.is_host ? 'Host & Commander' : 'Operative'}</Text>
        </View>

        {/* Ready Status Pill */}
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
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleLeave}
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
            {currentRoom.name.toUpperCase()}
          </Text>
          <Text style={styles.headerSub}>OPERATION ASSEMBLY</Text>
        </View>

        {isHost ? (
          <TouchableOpacity
            onPress={() => onOpenSettings?.(currentRoom.id)}
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
          <Text style={styles.codeLabel}>SECRET OPERATION KEY</Text>
          <TouchableOpacity onPress={handleCopyCode} style={styles.copyBtn} activeOpacity={0.7}>
            <Text style={styles.copyBtnText}>{copied ? 'COPIED! ✓' : 'COPY KEY 📋'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.roomCodeDisplay}>{currentRoom.code}</Text>

        <View style={styles.rosterCountRow}>
          <Text style={styles.rosterCountText}>
            OPERATIVES: {players.length} / {currentRoom.max_players}
          </Text>
          <Text style={styles.minReqText}>
            {players.length < 4 ? `(Need ${4 - players.length} more to deploy)` : 'DEPLOYMENT READY'}
          </Text>
        </View>
      </View>

      {/* Players List */}
      <View style={styles.rosterContainer}>
        <Text style={styles.rosterSectionTitle}>OPERATIVE LINEUP</Text>

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
                  : 'START OPERATION 🚀'}
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
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    letterSpacing: 0.5,
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
    marginBottom: 10,
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
});
