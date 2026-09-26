import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { supabase } from '../../lib/supabase';
import { deleteAccount } from '../../lib/auth';
import { CHARACTER_IMAGES, RoleId } from '../../components/RoleCard';
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

export default function SettingsScreen({
  userAlias,
  onLogout,
  onProfileUpdated,
}: SettingsScreenProps) {
  const insets = useSafeAreaInsets();

  // Determine if this is a guest based on alias prop
  const isGuestAlias = Boolean(userAlias && userAlias.toLowerCase().startsWith('guest'));

  // User State
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [username, setUsername] = useState<string>(userAlias || '');
  const [originalUsername, setOriginalUsername] = useState<string>(userAlias || '');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(isGuestAlias);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Form State
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  // Audio / FX Toggles
  const [soundEffects, setSoundEffects] = useState(true);
  const [bgMusic, setBgMusic] = useState(true);
  const [vibrations, setVibrations] = useState(true);

  // Load User Data from Supabase
  const fetchUserProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const isAnonymous =
          user.is_anonymous === true ||
          !user.email ||
          user.app_metadata?.provider === "anonymous" ||
          (user.email && user.email.includes("anonymous")) ||
          Boolean(userAlias && userAlias.toLowerCase().startsWith("guest")) ||
          Boolean(user.user_metadata?.username && String(user.user_metadata.username).toLowerCase().startsWith("guest"));
        setUserId(user.id);
        setEmail(user.email || "");
        setIsGuest(Boolean(isAnonymous));

        const { data: profileData } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        if (profileData) {
          const typed = profileData as { username: string; avatar_url: string | null };
          const fetchedUsername = typed.username || user.email?.split("@")[0] || "Player";
          setUsername(fetchedUsername);
          setOriginalUsername(fetchedUsername);
          setSelectedAvatar(typed.avatar_url || null);
        }
      } else {
        setIsGuest(true);
      }
    } catch (err) {
      console.error("Error fetching settings profile:", err);
    }
  }, [userAlias]);

  useEffect(() => {
    let isMounted = true;
    const initProfile = async () => {
      await fetchUserProfile();
      if (isMounted) {
        setIsLoading(false);
      }
    };
    initProfile();
    return () => {
      isMounted = false;
    };
  }, [fetchUserProfile]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchUserProfile();
      onProfileUpdated?.();
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      console.error("Error refreshing settings:", err);
    } finally {
      setRefreshing(false);
    }
  }, [fetchUserProfile, onProfileUpdated]);

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
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', trimmed)
        .neq('id', userId)
        .maybeSingle();

      if (existingUser) {
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
        showToast(profileError.message, 'error');
        return;
      }

      await supabase.auth.updateUser({
        data: { username: trimmed, full_name: trimmed },
      });

      setOriginalUsername(trimmed);
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
    if (!newPassword || newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        showToast(error.message, 'error');
      } else {
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

  // Account Deletion Handler
  const handleDeleteAccountConfirm = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      setIsDeleteAccountModalOpen(false);
      if (onLogout) onLogout();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account';
      showToast(msg, 'error');
      setIsDeletingAccount(false);
      setIsDeleteAccountModalOpen(false);
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
  const activeAvatarImage = selectedAvatar && CHARACTER_IMAGES[selectedAvatar as RoleId];

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
                      onChangeText={setUsername}
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
                        <Text style={styles.label}>NEW PASSWORD</Text>
                        <TextInput
                          style={styles.inputFull}
                          secureTextEntry
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder="At least 6 characters"
                          placeholderTextColor="#475569"
                        />

                        <Text style={[styles.label, { marginTop: 10 }]}>CONFIRM NEW PASSWORD</Text>
                        <TextInput
                          style={styles.inputFull}
                          secureTextEntry
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          placeholder="Re-enter new password"
                          placeholderTextColor="#475569"
                        />

                        <TouchableOpacity
                          style={[styles.updatePasswordBtn, isUpdatingPassword && styles.btnDisabled]}
                          onPress={handleUpdatePassword}
                          disabled={isUpdatingPassword}
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
                  <View>
                    <Text style={styles.settingLabel}>Sound Effects</Text>
                    <Text style={styles.settingSub}>Card flips, voting bells, action cues</Text>
                  </View>
                  <Switch
                    value={soundEffects}
                    onValueChange={setSoundEffects}
                    trackColor={{ false: '#1e2638', true: '#e11d48' }}
                    thumbColor={soundEffects ? '#ffffff' : '#94a3b8'}
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View>
                    <Text style={styles.settingLabel}>Background Ambience</Text>
                    <Text style={styles.settingSub}>Suspenseful night & day soundtrack</Text>
                  </View>
                  <Switch
                    value={bgMusic}
                    onValueChange={setBgMusic}
                    trackColor={{ false: '#1e2638', true: '#e11d48' }}
                    thumbColor={bgMusic ? '#ffffff' : '#94a3b8'}
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View>
                    <Text style={styles.settingLabel}>Haptic Feedback</Text>
                    <Text style={styles.settingSub}>Vibrate on phase timer & role assignment</Text>
                  </View>
                  <Switch
                    value={vibrations}
                    onValueChange={setVibrations}
                    trackColor={{ false: '#1e2638', true: '#e11d48' }}
                    thumbColor={vibrations ? '#ffffff' : '#94a3b8'}
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
        onRequestClose={() => !isDeletingAccount && setIsDeleteAccountModalOpen(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => !isDeletingAccount && setIsDeleteAccountModalOpen(false)}
        >
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

                <View style={styles.actionModalBtnRow}>
                  <TouchableOpacity
                    style={styles.actionModalCancelBtn}
                    disabled={isDeletingAccount}
                    onPress={() => setIsDeleteAccountModalOpen(false)}
                  >
                    <Text style={styles.actionModalCancelBtnText}>CANCEL</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionModalConfirmBtn, styles.deleteConfirmBtn]}
                    disabled={isDeletingAccount}
                    onPress={handleDeleteAccountConfirm}
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
