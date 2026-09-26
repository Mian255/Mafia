import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { fetchPublicRooms, joinRoomByCode } from '../../lib/rooms';
import { useStableCallback } from '../../hooks/useStableCallback';
import type { PublicRoomItem, Room } from '../../lib/rooms';

interface JoinRoomScreenProps {
  onBack: () => void;
  onRoomJoined: (room: Room) => void;
}

export default function JoinRoomScreen({ onBack, onRoomJoined }: JoinRoomScreenProps) {
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [publicRooms, setPublicRooms] = useState<PublicRoomItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const loadPublicRooms = useCallback(async () => {
    try {
      const rooms = await fetchPublicRooms();
      setPublicRooms(rooms);
    } catch {
      // ignore
    } finally {
      setLoadingRooms(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchInitial = async () => {
      try {
        const rooms = await fetchPublicRooms();
        if (isMounted) {
          setPublicRooms(rooms);
          setLoadingRooms(false);
        }
      } catch {
        if (isMounted) setLoadingRooms(false);
      }
    };

    fetchInitial();
    const interval = setInterval(loadPublicRooms, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadPublicRooms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPublicRooms();
  }, [loadPublicRooms]);

  const handleJoinByCode = useStableCallback(async (targetCode?: string) => {
    const rawCode = targetCode || code;
    const cleanCode = rawCode.trim().toUpperCase();

    if (cleanCode.length !== 5) {
      setErrorMessage('Please enter a valid 5-character room code.');
      return;
    }

    if (isJoining) return;
    setIsJoining(true);
    setErrorMessage('');

    try {
      const room = await joinRoomByCode(cleanCode);
      onRoomJoined(room);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to join room. Please check the code.';
      setErrorMessage(msg);
    } finally {
      setIsJoining(false);
    }
  });

  const renderPublicRoomItem = ({ item }: { item: PublicRoomItem }) => {
    const isFull = item.player_count >= item.max_players;

    return (
      <View style={styles.roomItemCard}>
        <View style={styles.roomItemDetails}>
          <View style={styles.roomItemHeader}>
            <Text style={styles.roomItemTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <View
              style={[
                styles.occupancyBadge,
                isFull ? styles.occupancyFull : styles.occupancyAvailable,
              ]}
            >
              <Text
                style={[
                  styles.occupancyText,
                  isFull ? styles.occupancyTextFull : styles.occupancyTextAvailable,
                ]}
              >
                {item.player_count}/{item.max_players} PLAYERS
              </Text>
            </View>
          </View>

          <Text style={styles.roomHostText}>
            Host: <Text style={styles.roomHostName}>{item.host_username}</Text> • Code:{' '}
            <Text style={styles.roomCodeText}>{item.code}</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.quickJoinBtn, isFull && styles.quickJoinDisabled]}
          onPress={() => handleJoinByCode(item.code)}
          disabled={isFull || isJoining}
          activeOpacity={0.8}
        >
          <Text style={styles.quickJoinBtnText}>{isFull ? 'FULL' : 'ENTER'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 19l-7-7 7-7" stroke="#f1f5f9" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>JOIN OPERATION</Text>
          <Text style={styles.headerSub}>Direct Key or Public Lobby</Text>
        </View>

        <View style={styles.headerRightPlaceholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flexOne}
      >
        {/* Direct Code Entry Card */}
        <View style={styles.codeCard}>
          <Text style={styles.sectionLabel}>SECRET ROOM KEY</Text>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.codeInputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.codeInput}
              value={code}
              onChangeText={(text) => {
                setCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                if (errorMessage) setErrorMessage('');
              }}
              placeholder="5-DIGIT CODE"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={5}
              returnKeyType="go"
              onSubmitEditing={() => handleJoinByCode()}
              editable={!isJoining}
            />

            <TouchableOpacity
              style={[
                styles.submitCodeBtn,
                (code.length !== 5 || isJoining) && styles.submitCodeDisabled,
              ]}
              onPress={() => handleJoinByCode()}
              disabled={code.length !== 5 || isJoining}
              activeOpacity={0.85}
            >
              {isJoining ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitCodeText}>INFILTRATE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Public Rooms Header */}
        <View style={styles.publicHeaderRow}>
          <Text style={styles.publicSectionTitle}>ACTIVE PUBLIC BASES</Text>
          <TouchableOpacity onPress={loadPublicRooms} activeOpacity={0.7}>
            <Text style={styles.refreshText}>REFRESH</Text>
          </TouchableOpacity>
        </View>

        {/* Public Rooms List */}
        {loadingRooms && !refreshing ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#e11d48" size="large" />
            <Text style={styles.loadingText}>Scanning frequency channels...</Text>
          </View>
        ) : (
          <FlatList
            data={publicRooms}
            keyExtractor={(item) => item.id}
            renderItem={renderPublicRoomItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#e11d48"
                colors={['#e11d48']}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>NO PUBLIC BASES ACTIVE</Text>
                <Text style={styles.emptySub}>
                  No operations are currently open. Enter a private key or create your own room.
                </Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  flexOne: {
    flex: 1,
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleGroup: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  headerRightPlaceholder: {
    width: 40,
  },
  codeCard: {
    backgroundColor: '#0f172a',
    margin: 20,
    marginBottom: 10,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 12,
  },
  errorBanner: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 1,
    borderColor: '#e11d48',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#fb7185',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  codeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#07090e',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    marginRight: 10,
  },
  submitCodeBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitCodeDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  submitCodeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  publicHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 10,
  },
  publicSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  refreshText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  roomItemCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomItemDetails: {
    flex: 1,
    marginRight: 12,
  },
  roomItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  roomItemTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  occupancyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  occupancyAvailable: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  occupancyFull: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  occupancyText: {
    fontSize: 10,
    fontWeight: '800',
  },
  occupancyTextAvailable: {
    color: '#34d399',
  },
  occupancyTextFull: {
    color: '#f87171',
  },
  roomHostText: {
    color: '#64748b',
    fontSize: 12,
  },
  roomHostName: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
  roomCodeText: {
    color: '#fbbf24',
    fontWeight: '800',
    letterSpacing: 1,
  },
  quickJoinBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickJoinDisabled: {
    borderColor: '#334155',
    backgroundColor: '#0b1120',
    opacity: 0.5,
  },
  quickJoinBtnText: {
    color: '#38bdf8',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#0c1017',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySub: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
