import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { deleteAccount } from '../../lib/auth';
import { validateNewPassword, getFriendlyAuthError, MIN_PASSWORD_LENGTH } from '../../lib/authHelpers';
import { CHARACTER_IMAGES, RoleId } from '../../components/RoleCard';
import { AVAILABLE_PHOTOS, PHOTO_SOURCES, resolveAvatarImage } from '../../lib/avatars';
import { SnapchatPullRefreshScreen } from '../../components/refresh';

interface SettingsScreenProps {
  userAlias?: string;
  onLogout?: () => void;
  onProfileUpdated?: () => void;
}

// Avatars as pure visual identity choices
const AVAILABLE_AVATARS: { id: RoleId; image: any }[] = [
  { id: 'civilian', image: CHARACTER_IMAGES.civilian },
  { id: 'detective', image: CHARACTER_IMAGES.detective },
  { id: 'doctor', image: CHARACTER_IMAGES.doctor },
  { id: 'mafia', image: CHARACTER_IMAGES.mafia },
];

// Single JSON blob for local-only user preferences (audio / haptics).
const PREFS_STORAGE_KEY = 'settings:prefs';

/**
 * Detects an anonymous/guest session using reliable signals from the Supabase user object,
 * falling back to a narrow alias heuristic only when no reliable signal exists.
 */
function detectGuest(user: User, aliasHint?: string): boolean {
  if (typeof user.is_anonymous === 'boolean') return user.is_anonymous;
  if (user.app_metadata?.provider === 'anonymous') return true;
  // A registered email is a strong signal that this is a real (non-anonymous) account.
  if (user.email && user.email.trim().length > 0) return false;
  // No reliable signal: fall back to a narrowed alias heuristic.
  const alias = (aliasHint || '').trim().toLowerCase();
  return alias === 'guest' || alias.startsWith('guest_');
}

/** Escapes SQL LIKE/ILIKE wildcards so a value is matched literally (case-insensitive exact match). */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** True when a Postgres/PostgREST error is a unique-constraint violation. */
function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === '23505' ||
    /duplicate key|already exists|unique constraint/i.test(error.message || '')
  );
}

export default function SettingsScreen({
  userAlias,
  onLogout,
  onProfileUpdated,
}: SettingsScreenProps) {
  const insets = useSafeAreaInsets();

  // Narrow initial guess (real user object resolves this once loaded).
  const initialGuestGuess = Boolean(
    userAlias &&
      (userAlias.trim().toLowerCase() === 'guest' ||
        userAlias.trim().toLowerCase().startsWith('guest_'))
  );

  // User State
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [username, setUsername] = useState<string>(userAlias || '');
  const [originalUsername, setOriginalUsername] = useState<string>(userAlias || '');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(initialGuestGuess);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Refs: mount guard, in-progress username edit guard, toast timer.
  const mountedRef = useRef(true);
  const isUsernameDirtyRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal State
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);

  // Action Loading States
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Password Change UI
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Delete Account confirmation gate
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Status Banners
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Preferences State
  const [ambientSound, setAmbientSound] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);

  // Shared profile/session fetch used by both the initial load and pull-to-refresh.
  const fetchProfile = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        if (mountedRef.current) {
          setIsGuest(true);
          setUsername((prev) => prev || userAlias || 'Guest');
        }
        return;
      }

      const guest = detectGuest(user, userAlias);

      if (!mountedRef.current) return;
      setUserId(user.id);
      setEmail(user.email || '');
      setIsGuest(guest);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (!mountedRef.current) return;
      const typed = profileData as { username: string; avatar_url: string | null } | null;
      const fetchedUsername = typed?.username || user.email?.split('@')[0] || 'Player';
      if (!isUsernameDirtyRef.current) {
        setUsername(fetchedUsername);
        setOriginalUsername(fetchedUsername);
      }
      setSelectedAvatar(typed?.avatar_url ?? null);
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  }, [userAlias]);

  // Initial load of user & profile data.
  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfile().finally(() => {
      if (mountedRef.current) setIsLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [fetchProfile]);

  // Load persisted preferences once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_STORAGE_KEY);
        if (raw && active) {
          const parsed = JSON.parse(raw) as Partial<{
            ambientSound: boolean;
            soundEffects: boolean;
            hapticFeedback: boolean;
          }>;
          if (typeof parsed.ambientSound === 'boolean') setAmbientSound(parsed.ambientSound);
          if (typeof parsed.soundEffects === 'boolean') setSoundEffects(parsed.soundEffects);
          if (typeof parsed.hapticFeedback === 'boolean') setHapticFeedback(parsed.hapticFeedback);
        }
      } catch (err) {
        console.warn('Failed to load preferences:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const persistPrefs = useCallback(
    (next: { ambientSound: boolean; soundEffects: boolean; hapticFeedback: boolean }) => {
      AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next)).catch((err) =>
        console.warn('Failed to save preferences:', err)
      );
    },
    []
  );

  const handleToggleAmbientSound = (value: boolean) => {
    setAmbientSound(value);
    persistPrefs({ ambientSound: value, soundEffects, hapticFeedback });
  };
  const handleToggleSoundEffects = (value: boolean) => {
    setSoundEffects(value);
    persistPrefs({ ambientSound, soundEffects: value, hapticFeedback });
  };
  const handleToggleHaptics = (value: boolean) => {
    setHapticFeedback(value);
    persistPrefs({ ambientSound, soundEffects, hapticFeedback: value });
  };

  const closeDeleteModal = () => {
    if (isDeletingAccount) return;
    setIsDeleteAccountModalOpen(false);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchProfile();
      onProfileUpdated?.();
    } catch (err) {
      console.error('Error refreshing settings:', err);
    } finally {
      setRefreshing(false);
    }
  }, [fetchProfile, onProfileUpdated]);

  // Avatar Update Handler
  const handleSelectAvatar = async (avatarId: string | null) => {
    if (!userId || isUpdatingAvatar) {
      setSelectedAvatar(avatarId);
      setIsAvatarModalOpen(false);
      return;
    }

    const previousAvatar = selectedAvatar;
    setSelectedAvatar(avatarId);
    setIsUpdatingAvatar(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: avatarId,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', userId);

      if (error) {
        setSelectedAvatar(previousAvatar);
        showToast(`Failed to update avatar: ${error.message}`, 'error');
      } else {
        showToast('Avatar updated successfully');
        setIsAvatarModalOpen(false);
        if (onProfileUpdated) onProfileUpdated();
      }
    } catch (err: unknown) {
      setSelectedAvatar(previousAvatar);
      const msg = err instanceof Error ? err.message : 'Failed to update avatar';
      showToast(msg, 'error');
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  // Username Update Handler
  const handleSaveUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      showToast('Username cannot be empty', 'error');
      return;
    }
    if (trimmed.length < 3) {
      showToast('Username must be at least 3 characters', 'error');
      return;
    }
    if (trimmed.length > 20) {
      showToast('Username must be 20 characters or fewer', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      showToast('Username can only contain letters, numbers, and underscores', 'error');
      return;
    }
    if (trimmed === originalUsername) {
      showToast('No changes made to username');
      return;
    }

    if (!userId) return;

    setIsSavingAlias(true);
    try {
      // Friendly pre-check: exact (case-insensitive) match. Wildcards are escaped so a username
      // containing "_" isn't treated as a LIKE single-char wildcard (spurious "taken").
      const { data: existingUser, error: lookupError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', escapeLikePattern(trimmed))
        .neq('id', userId)
        .maybeSingle();

      if (lookupError) {
        console.warn('Username availability check failed:', lookupError.message);
      } else if (existingUser) {
        showToast('This username is already taken. Please choose another.', 'error');
        setIsSavingAlias(false);
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          username: trimmed,
          email: email || undefined,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', userId);

      if (profileError) {
        if (isUniqueViolation(profileError)) {
          showToast('This username is already taken. Please choose another.', 'error');
        } else {
          showToast(profileError.message, 'error');
        }
        return;
      }

      await supabase.auth.updateUser({
        data: { username: trimmed, full_name: trimmed },
      });

      setOriginalUsername(trimmed);
      isUsernameDirtyRef.current = false;
      showToast(`Username updated to "${trimmed}"`);
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update username';
      showToast(msg, 'error');
    } finally {
      setIsSavingAlias(false);
    }
  };

  // Password Reset Email Trigger
  const handleSendResetEmail = async () => {
    if (!email) {
      showToast('No registered email found', 'error');
      return;
    }

    setIsSendingResetEmail(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast(`Password reset link sent to ${email}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error sending reset email';
      showToast(msg, 'error');
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  // Direct In-App Password Update
  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      showToast('Please enter your current password', 'error');
      return;
    }
    const pwError = validateNewPassword(newPassword);
    if (pwError) {
      showToast(pwError, 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (!email) {
      showToast('No registered email found', 'error');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        showToast('Current password is incorrect', 'error');
        setIsUpdatingPassword(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        showToast(getFriendlyAuthError(error, error.message), 'error');
      } else {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordSection(false);
        showToast('Password updated successfully!');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      showToast(msg, 'error');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Sign out helper
  const handleConfirmLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    setIsLogoutModalOpen(false);
    if (onLogout) onLogout();
  };

  const initialLetter = (username || 'P').charAt(0).toUpperCase();
  const activeAvatarImage = resolveAvatarImage(selectedAvatar);

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
                  <Text style={styles.headerEyebrow}>ACCOUNT & PREFERENCES</Text>
                  <Text style={styles.title}>SETTINGS</Text>
                </View>
              </View>

              {/* Global Toast / Feedback Banner */}
              {statusMessage && (
                <View
                  style={[
                    styles.toastBanner,
                    statusMessage.type === 'error' ? styles.toastError : styles.toastSuccess,
                  ]}
                >
                  <Text style={styles.toastEmoji}>
                    {statusMessage.type === 'error' ? '⚠️' : '✓'}
                  </Text>
                  <Text style={styles.toastText}>{statusMessage.text}</Text>
                </View>
              )}
            </View>
          )}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 80, 100) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading && !refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#e11d48" />
              <Text style={styles.loadingText}>LOADING SETTINGS...</Text>
            </View>
          ) : (
            <>
              {/* SECTION 1: PROFILE AVATAR */}
              <Text style={styles.sectionHeader}>PROFILE</Text>
              <View style={styles.profileCircleCard}>
                <TouchableOpacity
                  style={styles.avatarCircleBtn}
                  activeOpacity={0.8}
                  onPress={() => setIsAvatarModalOpen(true)}
                >
                  {activeAvatarImage ? (
                    <Image source={activeAvatarImage} style={styles.avatarCircleImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.initialCircle}>
                      <Text style={styles.initialLetterText}>{initialLetter}</Text>
                    </View>
                  )}
                  <View style={styles.avatarEditBadge}>
                    <Text style={styles.editBadgeText}>✎</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.profileInfoCol}>
                  <Text style={styles.profileDisplayNameText}>
                    {username || (isGuest ? 'Guest' : 'Player')}
                  </Text>
                  <Text style={styles.profileEmailSub}>
                    {isGuest ? 'Guest Account' : email || 'No email registered'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsAvatarModalOpen(true)}
                    style={styles.changeAvatarLink}
                  >
                    <Text style={styles.changeAvatarLinkText}>CHANGE AVATAR →</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* SECTION 2: IDENTITY / USERNAME */}
              <Text style={styles.sectionHeader}>IDENTITY</Text>
              <View style={styles.card}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>USERNAME</Text>
                  <View style={styles.aliasRow}>
                    <TextInput
                      style={styles.input}
                      value={username}
                      onChangeText={(text) => {
                        isUsernameDirtyRef.current = true;
                        setUsername(text);
                      }}
                      placeholder="Enter username"
                      placeholderTextColor="#475569"
                      maxLength={20}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[
                        styles.saveAliasBtn,
                        (username.trim() === originalUsername || isSavingAlias) && styles.btnDisabled,
                      ]}
                      onPress={handleSaveUsername}
                      disabled={username.trim() === originalUsername || isSavingAlias}
                      activeOpacity={0.8}
                    >
                      {isSavingAlias ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.saveAliasBtnText}>SAVE</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.inputHint}>
                    Letters, numbers, underscores (3-20 chars).
                  </Text>
                </View>

                {!isGuest && email ? (
                  <View style={styles.fieldBlockNoBorder}>
                    <Text style={styles.label}>REGISTERED EMAIL</Text>
                    <View style={styles.emailRow}>
                      <Text style={styles.emailValueText}>{email}</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* SECTION 3: SECURITY & PASSWORD */}
              {!isGuest && (
                <>
                  <Text style={styles.sectionHeader}>SECURITY & PASSWORD</Text>
                  <View style={styles.card}>
                    <TouchableOpacity
                      style={styles.securityHeaderBtn}
                      activeOpacity={0.7}
                      onPress={() => setShowPasswordSection(!showPasswordSection)}
                    >
                      <View style={styles.securityIconRow}>
                        <View style={styles.securityIconCircle}>
                          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                            <Path
                              d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z"
                              stroke="#e11d48"
                              strokeWidth={2}
                            />
                            <Path
                              d="M7 11V7a5 5 0 0 1 10 0v4"
                              stroke="#e11d48"
                              strokeWidth={2}
                            />
                          </Svg>
                        </View>
                        <View>
                          <Text style={styles.settingLabel}>Change Password</Text>
                          <Text style={styles.settingSub}>
                            Update or reset your login credentials
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.caretText}>{showPasswordSection ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {showPasswordSection && (
                      <View style={styles.passwordExpandableForm}>
                        <Text style={styles.label}>CURRENT PASSWORD</Text>
                        <TextInput
                          style={styles.inputFull}
                          value={currentPassword}
                          onChangeText={setCurrentPassword}
                          placeholder="Enter current password..."
                          placeholderTextColor="#475569"
                          secureTextEntry
                          autoCapitalize="none"
                        />

                        <Text style={[styles.label, { marginTop: 10 }]}>NEW PASSWORD</Text>
                        <TextInput
                          style={styles.inputFull}
                          secureTextEntry
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters...`}
                          placeholderTextColor="#475569"
                          autoCapitalize="none"
                        />

                        <Text style={[styles.label, { marginTop: 10 }]}>CONFIRM NEW PASSWORD</Text>
                        <TextInput
                          style={styles.inputFull}
                          secureTextEntry
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          placeholder="Re-enter new password"
                          placeholderTextColor="#475569"
                          autoCapitalize="none"
                        />

                        <TouchableOpacity
                          style={[
                            styles.updatePasswordBtn,
                            (!currentPassword ||
                              !newPassword ||
                              newPassword.length < MIN_PASSWORD_LENGTH ||
                              isUpdatingPassword) &&
                              styles.btnDisabled,
                          ]}
                          onPress={handleUpdatePassword}
                          disabled={
                            isUpdatingPassword ||
                            !currentPassword ||
                            !newPassword ||
                            newPassword.length < MIN_PASSWORD_LENGTH
                          }
                          activeOpacity={0.85}
                        >
                          {isUpdatingPassword ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.updatePasswordBtnText}>UPDATE PASSWORD</Text>
                          )}
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <TouchableOpacity
                          style={styles.resetEmailActionRow}
                          onPress={handleSendResetEmail}
                          disabled={isSendingResetEmail}
                        >
                          <Text style={styles.sendLinkActionText}>
                            {isSendingResetEmail ? 'Sending...' : 'Send Password Reset Link via Email →'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* SECTION 4: PREFERENCES & AUDIO */}
              <Text style={styles.sectionHeader}>AUDIO & GAMEPLAY</Text>
              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.settingLabel}>Background Music</Text>
                    <Text style={styles.settingSub}>Play music in menus and games</Text>
                  </View>
                  <Switch
                    value={ambientSound}
                    onValueChange={handleToggleAmbientSound}
                    trackColor={{ false: '#334155', true: '#e11d48' }}
                    thumbColor="#ffffff"
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.settingLabel}>Sound Effects</Text>
                    <Text style={styles.settingSub}>Card flips, voting bells, action cues</Text>
                  </View>
                  <Switch
                    value={soundEffects}
                    onValueChange={handleToggleSoundEffects}
                    trackColor={{ false: '#334155', true: '#e11d48' }}
                    thumbColor="#ffffff"
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.settingLabel}>Haptic Feedback</Text>
                    <Text style={styles.settingSub}>Vibrate on phase timer & role assignment</Text>
                  </View>
                  <Switch
                    value={hapticFeedback}
                    onValueChange={handleToggleHaptics}
                    trackColor={{ false: '#334155', true: '#e11d48' }}
                    thumbColor="#ffffff"
                  />
                </View>
              </View>

              {/* SECTION 5: ACCOUNT ACTIONS */}
              <Text style={styles.sectionHeader}>ACCOUNT ACTIONS</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.logoutBtn}
                  activeOpacity={0.8}
                  onPress={() => setIsLogoutModalOpen(true)}
                  disabled={isDeletingAccount}
                >
                  <Text style={styles.logoutBtnText}>LOG OUT</Text>
                </TouchableOpacity>

                {!isGuest && (
                  <View style={styles.dangerZoneContainer}>
                    <Text style={styles.dangerZoneTitle}>DANGER ZONE</Text>
                    <Text style={styles.dangerZoneDesc}>
                      Permanently delete your profile, stats, friendships, and all associated game data.
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteAccountBtn}
                      activeOpacity={0.8}
                      onPress={() => setIsDeleteAccountModalOpen(true)}
                    >
                      <Text style={styles.deleteAccountBtnText}>DELETE ACCOUNT</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          )}
        </SnapchatPullRefreshScreen>
      </KeyboardAvoidingView>

      {/* AVATAR SELECTION MODAL */}
      <Modal
        visible={isAvatarModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAvatarModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsAvatarModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>CHOOSE AVATAR</Text>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setIsAvatarModalOpen(false)}
                  >
                    <Text style={styles.modalCloseBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                  Select your in-game persona badge or default letter.
                </Text>

                <ScrollView
                  style={styles.modalScrollArea}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.modalAvatarGrid}>
                    {/* Default Letter Option */}
                    <TouchableOpacity
                      style={[
                        styles.avatarGridItem,
                        !selectedAvatar && styles.avatarGridItemSelected,
                      ]}
                      onPress={() => handleSelectAvatar(null)}
                    >
                      <View style={styles.modalInitialCircle}>
                        <Text style={styles.modalInitialLetterText}>{initialLetter}</Text>
                      </View>
                      {!selectedAvatar && (
                        <View style={styles.modalCheckBadge}>
                          <Text style={styles.modalCheckText}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Character Avatars */}
                    {AVAILABLE_AVATARS.map((avatar) => {
                      const isSelected = selectedAvatar === avatar.id;
                      return (
                        <TouchableOpacity
                          key={avatar.id}
                          style={[
                            styles.avatarGridItem,
                            isSelected && styles.avatarGridItemSelected,
                          ]}
                          onPress={() => handleSelectAvatar(avatar.id)}
                        >
                          <Image
                            source={avatar.image}
                            style={styles.modalAvatarImg}
                            resizeMode="cover"
                          />
                          {isSelected && (
                            <View style={styles.modalCheckBadge}>
                              <Text style={styles.modalCheckText}>✓</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Personal Photo Avatars */}
                  <Text style={styles.modalSectionLabel}>AVATARS</Text>
                  <View style={styles.modalAvatarGrid}>
                    {AVAILABLE_PHOTOS.map((photo) => {
                      const isSelected = selectedAvatar === photo;
                      return (
                        <TouchableOpacity
                          key={photo}
                          style={[
                            styles.avatarGridItem,
                            isSelected && styles.avatarGridItemSelected,
                          ]}
                          onPress={() => handleSelectAvatar(photo)}
                        >
                          <Image
                            source={PHOTO_SOURCES[photo]}
                            style={styles.modalAvatarImg}
                            resizeMode="cover"
                          />
                          {isSelected && (
                            <View style={styles.modalCheckBadge}>
                              <Text style={styles.modalCheckText}>✓</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                {isUpdatingAvatar && (
                  <View style={styles.updatingIndicatorWrap}>
                    <ActivityIndicator size="small" color="#e11d48" />
                    <Text style={styles.updatingText}>Saving avatar...</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => setIsAvatarModalOpen(false)}
                >
                  <Text style={styles.modalDoneBtnText}>DONE</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* LOGOUT CONFIRMATION MODAL */}
      <Modal
        visible={isLogoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLogoutModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsLogoutModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.actionModalCard}>
                <View style={styles.actionModalIconWrap}>
                  <Text style={styles.actionModalEmoji}>🚪</Text>
                </View>
                <Text style={styles.actionModalTitle}>LOG OUT?</Text>
                <Text style={styles.actionModalDesc}>
                  Are you sure you want to sign out of your account?
                </Text>

                <View style={styles.actionModalBtnRow}>
                  <TouchableOpacity
                    style={styles.actionModalCancelBtn}
                    onPress={() => setIsLogoutModalOpen(false)}
                  >
                    <Text style={styles.actionModalCancelBtnText}>CANCEL</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionModalConfirmBtn}
                    onPress={handleConfirmLogout}
                  >
                    <Text style={styles.actionModalConfirmBtnText}>LOG OUT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* DELETE ACCOUNT CONFIRMATION MODAL */}
      <Modal
        visible={isDeleteAccountModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <TouchableWithoutFeedback onPress={closeDeleteModal}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={[styles.actionModalCard, styles.deleteModalCard]}>
                <View style={[styles.actionModalIconWrap, styles.deleteIconWrap]}>
                  <Text style={styles.actionModalEmoji}>⚠️</Text>
                </View>
                <Text style={styles.actionModalTitle}>DELETE ACCOUNT?</Text>
                <Text style={styles.actionModalDesc}>
                  This action is permanent and cannot be undone. All your stats, friendships, and profile data will be permanently wiped.
                </Text>

                <View style={styles.deleteWarningBox}>
                  <Text style={styles.deleteWarningText}>⚠️ This cannot be recovered</Text>
                </View>

                {/* Typed confirmation gate */}
                <View style={{ width: '100%', marginBottom: 16 }}>
                  <Text style={[styles.label, { color: '#fca5a5', marginBottom: 6 }]}>
                    TYPE &quot;DELETE&quot; TO CONFIRM
                  </Text>
                  <TextInput
                    style={styles.inputFull}
                    value={deleteConfirmText}
                    onChangeText={setDeleteConfirmText}
                    placeholder="DELETE"
                    placeholderTextColor="#475569"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!isDeletingAccount}
                  />
                </View>

                {deleteError && (
                  <Text
                    style={{
                      color: '#fca5a5',
                      fontSize: 11,
                      fontWeight: '700',
                      textAlign: 'center',
                      marginBottom: 12,
                    }}
                  >
                    {deleteError}
                  </Text>
                )}

                <View style={styles.actionModalBtnRow}>
                  <TouchableOpacity
                    style={styles.actionModalCancelBtn}
                    disabled={isDeletingAccount}
                    onPress={closeDeleteModal}
                  >
                    <Text style={styles.actionModalCancelBtnText}>CANCEL</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionModalConfirmBtn,
                      styles.deleteConfirmBtn,
                      (isDeletingAccount ||
                        deleteConfirmText.trim().toUpperCase() !== 'DELETE') &&
                        styles.btnDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={
                      isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'
                    }
                    onPress={async () => {
                      setDeleteError(null);
                      setIsDeletingAccount(true);
                      try {
                        await deleteAccount();
                        setIsDeleteAccountModalOpen(false);
                        setDeleteConfirmText('');
                        if (onLogout) onLogout();
                      } catch (err) {
                        console.error('Error deleting account:', err);
                        setDeleteError('Account deletion failed, please try again.');
                      } finally {
                        setIsDeletingAccount(false);
                      }
                    }}
                  >
                    {isDeletingAccount ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.actionModalConfirmBtnText}>DELETE</Text>
                    )}
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
    backgroundColor: '#090d16',
  },
  headerWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8e9eb5',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Header */
  header: {
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

  /* Toast Notification */
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 12,
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

  /* Section Title */
  sectionHeader: {
    color: '#8e9eb5',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 2,
  },

  /* Profile Card */
  profileCircleCard: {
    backgroundColor: '#111724',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e2638',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircleBtn: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarCircleImg: {
    width: '100%',
    height: '100%',
  },
  initialCircle: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialLetterText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#e11d48',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#111724',
  },
  editBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  profileInfoCol: {
    flex: 1,
  },
  profileDisplayNameText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  profileEmailSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  changeAvatarLink: {
    marginTop: 6,
  },
  changeAvatarLinkText: {
    color: '#e11d48',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  /* General Cards */
  card: {
    backgroundColor: '#111724',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e2638',
    padding: 14,
  },
  fieldBlock: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a2233',
    paddingBottom: 12,
    marginBottom: 12,
  },
  fieldBlockNoBorder: {
    paddingTop: 2,
  },
  label: {
    color: '#64748b',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  aliasRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: '#1e2638',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  inputFull: {
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: '#1e2638',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  saveAliasBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 58,
  },
  saveAliasBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  inputHint: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 6,
  },

  emailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  emailValueText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Security Accordion */
  securityHeaderBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  securityIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  securityIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a2233',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caretText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 8,
  },
  passwordExpandableForm: {
    backgroundColor: '#0a0d14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e2638',
    padding: 12,
    marginTop: 12,
  },
  updatePasswordBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  updatePasswordBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  resetEmailActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  sendLinkActionText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  /* Toggle Settings */
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  settingLabel: {
    color: '#f8fafc',
    fontSize: 13.5,
    fontWeight: '700',
  },
  settingSub: {
    color: '#8e9eb5',
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#1a2233',
    marginVertical: 10,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  /* Logout Button */
  logoutBtn: {
    flexDirection: 'row',
    backgroundColor: '#1a0e14',
    borderWidth: 1.5,
    borderColor: '#e11d48',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  logoutBtnText: {
    color: '#f43f5e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },

  /* Danger Zone */
  dangerZoneContainer: {
    marginTop: 20,
    backgroundColor: '#120b0e',
    borderWidth: 1,
    borderColor: '#3f1219',
    borderRadius: 14,
    padding: 14,
  },
  dangerZoneTitle: {
    color: '#ef4444',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  dangerZoneDesc: {
    color: '#71717a',
    fontSize: 10.5,
    lineHeight: 14,
    marginBottom: 12,
  },
  deleteAccountBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteAccountBtnText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  /* Avatar Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 6, 12, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '82%',
    backgroundColor: '#101522',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#243046',
    padding: 20,
  },
  modalScrollArea: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalSectionLabel: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 16,
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
  modalSubtitle: {
    color: '#8e9eb5',
    fontSize: 11,
    marginBottom: 18,
  },
  modalAvatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarGridItem: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0a0d14',
    borderWidth: 2,
    borderColor: '#1e2638',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGridItemSelected: {
    borderColor: '#e11d48',
    borderWidth: 2.5,
  },
  modalInitialCircle: {
    width: '100%',
    height: '100%',
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInitialLetterText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  modalAvatarImg: {
    width: '100%',
    height: '100%',
  },
  modalCheckBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCheckText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  updatingIndicatorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  updatingText: {
    color: '#8e9eb5',
    fontSize: 11,
  },
  modalDoneBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },

  /* Action Confirmation Modals */
  actionModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#101522',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#243046',
    padding: 22,
    alignItems: 'center',
  },
  deleteModalCard: {
    borderColor: '#4c1d24',
    backgroundColor: '#0f0c10',
  },
  actionModalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1a2233',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteIconWrap: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  actionModalEmoji: {
    fontSize: 24,
  },
  actionModalTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 6,
    textAlign: 'center',
  },
  actionModalDesc: {
    color: '#94a3b8',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  deleteWarningBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    width: '100%',
  },
  deleteWarningText: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionModalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  actionModalCancelBtn: {
    flex: 1,
    backgroundColor: '#1a2233',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionModalCancelBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  actionModalConfirmBtn: {
    flex: 1,
    backgroundColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtn: {
    backgroundColor: '#dc2626',
  },
  actionModalConfirmBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
