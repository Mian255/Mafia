import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { CHARACTER_IMAGES, RoleId } from '../../components/RoleCard';
import { SnapchatPullRefreshScreen } from '../../components/refresh';

interface FriendItem {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface FriendRequestItem {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_avatar: string | null;
  created_at: string;
}

interface SearchUserResult {
  id: string;
  username: string;
  avatar_url: string | null;
  isFriend: boolean;
  hasPendingRequest: boolean;
  isSelf: boolean;
}

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();

  // User & DB State (100% Dynamic from Supabase DB)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequestItem[]>([]);
  const [sentRequestsSet, setSentRequestsSet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Auto-Suggest State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const activeSearchTokenRef = useRef<number>(0);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTokenRef = useRef(0);

  // Modals & Action States
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [sendingRequestUserId, setSendingRequestUserId] = useState<string | null>(null);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  // 1. Data Fetch & Refresh Logic
  const loadFriendsData = useCallback(async () => {
    const token = ++loadTokenRef.current;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);

        if (user.email) {
          Promise.resolve(
            supabase
              .from('profiles')
              .update({ email: user.email } as never)
              .eq('id', user.id)
          ).catch(() => {});
        }

        const { data: friendshipsData } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

        if (token !== loadTokenRef.current) return;

        if (friendshipsData) {
          const friendIds = Array.from(
            new Set(
              (friendshipsData || [])
                .map((f: { user_id: string; friend_id: string }) =>
                  f.user_id === user.id ? f.friend_id : f.user_id
                )
                .filter((id: string) => id && id !== user.id)
            )
          );

          if (friendIds.length > 0) {
            const { data: friendProfiles } = await supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .in('id', friendIds);

            if (token !== loadTokenRef.current) return;

            if (friendProfiles) {
              const formattedFriends: FriendItem[] = friendProfiles.map((p: any) => ({
                id: p.id,
                username: p.username || 'Player',
                avatar_url: p.avatar_url,
              }));
              setFriends(formattedFriends);
            }
          } else {
            setFriends([]);
          }
        }

        const { data: incomingRequests } = await supabase
          .from('friend_requests')
          .select('id, sender_id, created_at')
          .eq('receiver_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (token !== loadTokenRef.current) return;

        if (incomingRequests && incomingRequests.length > 0) {
          const senderIds = incomingRequests.map((r: { sender_id: string }) => r.sender_id);
          const { data: sendersProfiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', senderIds);

          if (token !== loadTokenRef.current) return;

          const profileMap = new Map();
          if (sendersProfiles) {
            sendersProfiles.forEach((p: any) => profileMap.set(p.id, p));
          }

          const formattedRequests: FriendRequestItem[] = incomingRequests.map((r: any) => {
            const profile = profileMap.get(r.sender_id);
            return {
              id: r.id,
              sender_id: r.sender_id,
              sender_username: profile?.username || 'Player',
              sender_avatar: profile?.avatar_url || null,
              created_at: r.created_at,
            };
          });

          setPendingRequests(formattedRequests);
        } else {
          setPendingRequests([]);
        }

        const { data: sentReqs } = await supabase
          .from('friend_requests')
          .select('receiver_id')
          .eq('sender_id', user.id)
          .eq('status', 'pending');

        if (token !== loadTokenRef.current) return;

        if (sentReqs) {
          setSentRequestsSet(new Set(sentReqs.map((r: any) => r.receiver_id)));
        }
      }
    } catch (err) {
      console.error('Error loading friends data:', err);
    } finally {
      if (token === loadTokenRef.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, [showToast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFriendsData();
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      console.warn("Friends refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [loadFriendsData]);

  // 2. Real-Time DB Subscriptions
  useEffect(() => {
    let isMounted = true;
    let requestsChannel: ReturnType<typeof supabase.channel> | null = null;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    let friendsChannel: ReturnType<typeof supabase.channel> | null = null;

    // Coalesce realtime bursts (accepting a request emits several events) into a
    // single debounced reload. The token guard inside loadFriendsData still drops
    // any stale response that resolves out of order.
    const scheduleReload = () => {
      if (!isMounted) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        if (isMounted) loadFriendsData();
      }, 300);
    };

    const setupLiveListeners = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (isMounted) setIsLoading(false);
          return;
        }

        await loadFriendsData();

        // Re-check after the await: the component may have unmounted while the
        // initial load was in flight, so don't create channels we can't clean up.
        if (!isMounted) return;

        requestsChannel = supabase
          .channel(`incoming_requests_${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'friend_requests',
              filter: `receiver_id=eq.${user.id}`,
            },
            scheduleReload
          )
          .subscribe();

        friendsChannel = supabase
          .channel(`friendships_live_${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'friendships',
              filter: `user_id=eq.${user.id}`,
            },
            scheduleReload
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'friendships',
              filter: `friend_id=eq.${user.id}`,
            },
            scheduleReload
          )
          .subscribe();
      } catch (err) {
        console.error('Error initializing listeners:', err);
        if (isMounted) setIsLoading(false);
      }
    };

    setupLiveListeners();

    return () => {
      isMounted = false;
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
      if (reloadTimer) clearTimeout(reloadTimer);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (requestsChannel) supabase.removeChannel(requestsChannel);
      if (friendsChannel) supabase.removeChannel(friendsChannel);
    };
  }, [loadFriendsData]);

  // 3. Auto-Suggest Execution Logic (username-only, parameterized search)
  const executeSuggestQuery = useCallback(
    async (queryText: string, searchToken: number) => {
      try {
        const friendIdsSet = new Set(friends.map((f) => f.id));

        // Escape LIKE metacharacters so user input cannot act as wildcards
        const escaped = queryText.replace(/[\\%_]/g, (ch) => `\\${ch}`);

        const { data: matchedProfiles, error: searchErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .ilike('username', `%${escaped}%`)
          .limit(20);

        if (searchToken !== activeSearchTokenRef.current) {
          return;
        }

        if (searchErr) {
          console.error('Error suggesting players:', searchErr);
          setSearchResults([]);
          setIsSearching(false);
          return;
        }

        if (matchedProfiles && matchedProfiles.length > 0) {
          const results: SearchUserResult[] = matchedProfiles.map((p: any) => ({
            id: p.id,
            username: p.username || 'Player',
            avatar_url: p.avatar_url,
            isFriend: friendIdsSet.has(p.id),
            hasPendingRequest: sentRequestsSet.has(p.id),
            isSelf: p.id === currentUserId,
          }));
          setSearchResults(results);
        } else {
          setSearchResults([]);
        }
        setIsSearching(false);
      } catch (err) {
        if (searchToken === activeSearchTokenRef.current) {
          console.error('Error suggesting players:', err);
          setSearchResults([]);
          setIsSearching(false);
        }
      }
    },
    [currentUserId, friends, sentRequestsSet]
  );

  // 4. Real-time Search Text Input Handler with Immediate Debounce (50ms)
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    const trimmed = text.trim();

    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }

    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const token = ++activeSearchTokenRef.current;

    searchDebounceTimerRef.current = setTimeout(() => {
      executeSuggestQuery(trimmed, token);
    }, 50);
  };

  // 5. Send Friend Request to Supabase
  const handleSendFriendRequest = async (targetUserId: string, targetUsername: string) => {
    if (!currentUserId) {
      showToast('Please sign in with an account to send friend requests', 'error');
      return;
    }
    if (sendingRequestUserId) return;

    // Guard: cannot befriend yourself.
    if (targetUserId === currentUserId) {
      showToast('You cannot send a friend request to yourself', 'error');
      return;
    }

    // Guard: already friends.
    if (friends.some((f) => f.id === targetUserId)) {
      showToast(`You are already friends with ${targetUsername}`, 'error');
      return;
    }

    // Guard: they already sent us a pending request -> accept it instead of
    // creating a duplicate in the opposite direction.
    const reciprocal = pendingRequests.find((r) => r.sender_id === targetUserId);
    if (reciprocal) {
      await handleAcceptRequest(reciprocal);
      return;
    }

    // Guard: we already have a pending outbound request.
    if (sentRequestsSet.has(targetUserId)) {
      showToast(`Friend request already sent to ${targetUsername}`, 'error');
      return;
    }

    setSendingRequestUserId(targetUserId);
    try {
      // Best-effort block check (RLS only exposes rows where we are the blocker).
      const { data: blockedRows } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', targetUserId)
        .limit(1);

      if (blockedRows && blockedRows.length > 0) {
        showToast(`You have blocked ${targetUsername}. Unblock them to send a request.`, 'error');
        return;
      }

      const { error } = await supabase.from('friend_requests').insert({
        sender_id: currentUserId,
        receiver_id: targetUserId,
        status: 'pending',
      } as never);

      if (error) {
        const isDuplicate =
          (error as { code?: string }).code === '23505' ||
          /duplicate|unique/i.test(error.message || '');
        showToast(
          isDuplicate ? `Friend request already sent to ${targetUsername}` : error.message,
          'error'
        );
      } else {
        setSentRequestsSet((prev) => new Set([...prev, targetUserId]));
        setSearchResults((prev) =>
          prev.map((item) =>
            item.id === targetUserId ? { ...item, hasPendingRequest: true } : item
          )
        );
        showToast(`Friend request sent to ${targetUsername}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send friend request';
      showToast(msg, 'error');
    } finally {
      setSendingRequestUserId(null);
    }
  };

  // 6. Accept Friend Request in Supabase
  const handleAcceptRequest = async (request: FriendRequestItem) => {
    if (!currentUserId || processingRequestId) return;

    setProcessingRequestId(request.id);
    try {
      // Atomic server-side accept: updates the request status AND creates the
      // friendship in one transaction. Only claim success once it resolves.
      const { error } = await supabase.rpc('accept_friend_request', {
        p_request_id: request.id,
      } as never);

      if (error) {
        // Keep the request in the list so the user can retry.
        showToast(error.message || 'Could not accept friend request', 'error');
        return;
      }

      setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));
      showToast(`You are now friends with ${request.sender_username}!`);
      await loadFriendsData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error accepting friend request';
      showToast(msg, 'error');
    } finally {
      setProcessingRequestId(null);
    }
  };

  // 7. Decline Friend Request in Supabase
  const handleDeclineRequest = async (requestId: string) => {
    if (processingRequestId) return;

    setProcessingRequestId(requestId);
    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'declined' } as never)
        .eq('id', requestId);

      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Friend request declined');
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error declining request';
      showToast(msg, 'error');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
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
              {/* Top Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.headerEyebrow}>COMMUNITY</Text>
                  <Text style={styles.title}>FRIENDS</Text>
                </View>

                {/* Requests Button with Dynamic Badge */}
                <TouchableOpacity
                  style={[
                    styles.requestsBtn,
                    pendingRequests.length > 0 && styles.requestsBtnActive,
                  ]}
                  onPress={() => setIsRequestsModalOpen(true)}
                  activeOpacity={0.8}
                >
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
                      stroke={pendingRequests.length > 0 ? '#ffffff' : '#94a3b8'}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    <Circle
                      cx={8.5}
                      cy={7}
                      r={4}
                      stroke={pendingRequests.length > 0 ? '#ffffff' : '#94a3b8'}
                      strokeWidth={2}
                    />
                    <Path
                      d="M20 8v6M23 11h-6"
                      stroke={pendingRequests.length > 0 ? '#ffffff' : '#94a3b8'}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </Svg>
                  <Text
                    style={[
                      styles.requestsBtnText,
                      pendingRequests.length > 0 && styles.requestsBtnTextActive,
                    ]}
                  >
                    REQUESTS
                  </Text>
                  {pendingRequests.length > 0 && (
                    <View style={styles.requestsBadge}>
                      <Text style={styles.requestsBadgeText}>{pendingRequests.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Real-time Feedback Toast */}
              {toastMessage && (
                <View
                  style={[
                    styles.toastBanner,
                    toastMessage.type === 'error' ? styles.toastError : styles.toastSuccess,
                  ]}
                >
                  <Text style={styles.toastEmoji}>
                    {toastMessage.type === 'error' ? '⚠️' : '✓'}
                  </Text>
                  <Text style={styles.toastText}>{toastMessage.text}</Text>
                </View>
              )}

              {/* Instant Search Bar */}
              <View style={styles.searchContainer}>
                <Svg width={18} height={18} viewBox="0 0 24 24" style={styles.searchIcon}>
                  <Path
                    d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                    fill="#64748b"
                  />
                </Svg>

                <TextInput
                  style={styles.searchInput}
                  placeholder="Find players by username or email..."
                  placeholderTextColor="#475569"
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={styles.searchRightGroup}>
                  {isSearching && (
                    <ActivityIndicator size="small" color="#e11d48" style={styles.searchSpinner} />
                  )}
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => handleSearchChange('')}
                      style={styles.clearSearchBtn}
                    >
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 80, 100) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* A. SEARCH SUGGESTIONS VIEW */}
          {isSearchActive ? (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>MATCHING PLAYERS</Text>
                {isSearching && <Text style={styles.searchingHintText}>Searching...</Text>}
              </View>

              {searchResults.length === 0 && !isSearching ? (
                <View style={styles.emptyStateCard}>
                  <Text style={styles.emptyStateEmoji}>🔍</Text>
                  <Text style={styles.emptyStateTitle}>NO USERS FOUND</Text>
                  <Text style={styles.emptyStateSub}>
                    We could not find any player matching &quot;{searchQuery.trim()}&quot;.
                  </Text>
                </View>
              ) : (
                <View style={styles.cardsList}>
                  {searchResults.map((user) => {
                    const avatarImg =
                      user.avatar_url && CHARACTER_IMAGES[user.avatar_url as RoleId];
                    const initial = (user.username || 'P').charAt(0).toUpperCase();

                    return (
                      <View key={user.id} style={styles.userCard}>
                        {/* Avatar */}
                        <View style={styles.avatarCircle}>
                          {avatarImg ? (
                            <Image source={avatarImg} style={styles.avatarImg} resizeMode="cover" />
                          ) : (
                            <Text style={styles.avatarLetter}>{initial}</Text>
                          )}
                        </View>

                        {/* User info */}
                        <View style={styles.userInfoCol}>
                          <View style={styles.nameRow}>
                            <Text style={styles.userNameText}>{user.username}</Text>
                            {user.isSelf && (
                              <View style={styles.youBadge}>
                                <Text style={styles.youBadgeText}>YOU</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.userSubText}>Registered Player</Text>
                        </View>

                        {/* Action state */}
                        {!user.isSelf && (
                          <View>
                            {user.isFriend ? (
                              <View style={styles.alreadyFriendsTag}>
                                <Text style={styles.alreadyFriendsText}>FRIENDS ✓</Text>
                              </View>
                            ) : user.hasPendingRequest ? (
                              <View style={styles.pendingTag}>
                                <Text style={styles.pendingTagText}>PENDING...</Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.addFriendBtn}
                                activeOpacity={0.8}
                                disabled={sendingRequestUserId === user.id}
                                onPress={() => handleSendFriendRequest(user.id, user.username)}
                              >
                                {sendingRequestUserId === user.id ? (
                                  <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                  <Text style={styles.addFriendBtnText}>+ ADD FRIEND</Text>
                                )}
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            /* B. DEFAULT FRIENDS LIST VIEW */
            <View>
              {isLoading && !refreshing ? (
                <View style={styles.loadingWrapper}>
                  <ActivityIndicator size="large" color="#e11d48" />
                  <Text style={styles.loadingText}>LOADING FRIENDS...</Text>
                </View>
              ) : friends.length === 0 ? (
                <View style={styles.emptyStateCard}>
                  <Text style={styles.emptyStateEmoji}>👥</Text>
                  <Text style={styles.emptyStateTitle}>NO FRIENDS YET</Text>
                  <Text style={styles.emptyStateSub}>
                    Start typing a username in the search bar above to see live suggestions and add players.
                  </Text>
                </View>
              ) : (
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeader}>ALL FRIENDS ({friends.length})</Text>
                  </View>

                  <View style={styles.cardsList}>
                    {friends.map((friend) => {
                      const avatarImg =
                        friend.avatar_url && CHARACTER_IMAGES[friend.avatar_url as RoleId];
                      const initial = (friend.username || 'P').charAt(0).toUpperCase();

                      return (
                        <View key={friend.id} style={styles.userCard}>
                          <View style={styles.avatarCircle}>
                            {avatarImg ? (
                              <Image
                                source={avatarImg}
                                style={styles.avatarImg}
                                resizeMode="cover"
                              />
                            ) : (
                              <Text style={styles.avatarLetter}>{initial}</Text>
                            )}
                            <View style={styles.onlineDot} />
                          </View>

                          <View style={styles.userInfoCol}>
                            <Text style={styles.userNameText}>{friend.username}</Text>
                            <Text style={styles.onlineStatusText}>Ready to play</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
        </SnapchatPullRefreshScreen>
      </KeyboardAvoidingView>

      {/* 3. PENDING REQUESTS MODAL */}
      <Modal
        visible={isRequestsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRequestsModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsRequestsModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>FRIEND REQUESTS</Text>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setIsRequestsModalOpen(false)}
                  >
                    <Text style={styles.modalCloseBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSub}>
                  Review incoming friend invites from players.
                </Text>

                {pendingRequests.length === 0 ? (
                  <View style={styles.emptyRequestsBox}>
                    <Text style={styles.emptyRequestsEmoji}>📬</Text>
                    <Text style={styles.emptyRequestsTitle}>NO PENDING REQUESTS</Text>
                    <Text style={styles.emptyRequestsSub}>
                      When someone invites you, their request will appear here.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.requestsScrollView}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.requestsList}>
                      {pendingRequests.map((req) => {
                        const avatarImg =
                          req.sender_avatar && CHARACTER_IMAGES[req.sender_avatar as RoleId];
                        const initial = (req.sender_username || 'P').charAt(0).toUpperCase();
                        const isProcessing = processingRequestId === req.id;

                        return (
                          <View key={req.id} style={styles.requestCard}>
                            <View style={styles.requestAvatarCircle}>
                              {avatarImg ? (
                                <Image
                                  source={avatarImg}
                                  style={styles.avatarImg}
                                  resizeMode="cover"
                                />
                              ) : (
                                <Text style={styles.avatarLetter}>{initial}</Text>
                              )}
                            </View>

                            <View style={styles.requestInfoCol}>
                              <Text style={styles.requestNameText}>{req.sender_username}</Text>
                              <Text style={styles.requestSubText}>Wants to be friends</Text>
                            </View>

                            <View style={styles.requestActionsRow}>
                              <TouchableOpacity
                                style={styles.declineBtn}
                                disabled={isProcessing}
                                onPress={() => handleDeclineRequest(req.id)}
                              >
                                <Text style={styles.declineBtnText}>✕</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.acceptBtn}
                                disabled={isProcessing}
                                onPress={() => handleAcceptRequest(req)}
                              >
                                {isProcessing ? (
                                  <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                  <Text style={styles.acceptBtnText}>ACCEPT</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}

                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => setIsRequestsModalOpen(false)}
                >
                  <Text style={styles.modalDoneBtnText}>DONE</Text>
                </TouchableOpacity>
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
    backgroundColor: '#090d16',
  },
  headerWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerEyebrow: {
    color: '#e11d48',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  requestsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111724',
    borderWidth: 1,
    borderColor: '#1e2638',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  requestsBtnActive: {
    borderColor: '#e11d48',
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
  },
  requestsBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  requestsBtnTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  requestsBadge: {
    backgroundColor: '#e11d48',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },

  /* Search Bar */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111724',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2638',
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
    paddingVertical: 10,
    fontWeight: '600',
  },
  searchRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchSpinner: {
    marginRight: 2,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '800',
  },

  /* Toast Notification */
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  toastSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  toastError: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 1,
    borderColor: '#e11d48',
  },
  toastEmoji: {
    fontSize: 14,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  /* Scroll Content */
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeader: {
    color: '#8e9eb5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  searchingHintText: {
    color: '#e11d48',
    fontSize: 10.5,
    fontWeight: '700',
  },

  cardsList: {
    gap: 10,
  },
  userCard: {
    backgroundColor: '#111724',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e2638',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#111724',
  },
  userInfoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userNameText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  youBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  youBadgeText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  userSubText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 1,
  },
  onlineStatusText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },

  /* Action Buttons */
  addFriendBtn: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pendingTag: {
    backgroundColor: '#1e2638',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pendingTagText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
  },
  alreadyFriendsTag: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  alreadyFriendsText: {
    color: '#4ade80',
    fontSize: 10,
    fontWeight: '900',
  },

  /* Loading & Empty States */
  loadingWrapper: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#8e9eb5',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyStateCard: {
    backgroundColor: '#111724',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e2638',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyStateTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  emptyStateSub: {
    color: '#8e9eb5',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },

  /* Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 6, 12, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: '#101522',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#243046',
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseBtnText: {
    color: '#8e9eb5',
    fontSize: 16,
    fontWeight: '900',
  },
  modalSub: {
    color: '#8e9eb5',
    fontSize: 11.5,
    marginBottom: 16,
  },
  requestsScrollView: {
    maxHeight: 280,
    marginBottom: 14,
  },
  requestsList: {
    gap: 10,
  },
  requestCard: {
    backgroundColor: '#0a0d14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2638',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requestAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  requestInfoCol: {
    flex: 1,
  },
  requestNameText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  requestSubText: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 1,
  },
  requestActionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  declineBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1a2233',
    borderWidth: 1,
    borderColor: '#243046',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '900',
  },
  acceptBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  acceptBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  emptyRequestsBox: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0d14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2638',
    marginBottom: 16,
  },
  emptyRequestsEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyRequestsTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  emptyRequestsSub: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  modalDoneBtn: {
    backgroundColor: '#1a2233',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
