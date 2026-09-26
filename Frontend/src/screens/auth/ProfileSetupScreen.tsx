import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isUsernameAvailable,
  saveUsername,
  validateUsername,
} from '../../lib/profile';
import { rateLimiter } from '../../lib/rateLimit';
import {
  AuthCard,
  AuthErrorBanner,
  AuthHeader,
  AuthPrimaryButton,
  AuthTextInput,
  NoirBackground,
  renderUserIcon,
  useAuthLayout,
} from '../../components/auth';
import { useStableCallback } from '../../hooks/useStableCallback';

interface ProfileSetupScreenProps {
  user: User;
  onComplete: (username: string) => void;
}

type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken';

const TAKEN_MESSAGE = 'That username is already taken. Try another.';
const CONNECTION_MESSAGE = "Couldn't reach the server. Check your connection and try again.";
const SAVE_FAILED_MESSAGE = "Couldn't save your username. Please try again in a moment.";

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const message = 'message' in err && typeof err.message === 'string' ? err.message : '';
  return /network|fetch|timeout|failed to fetch/i.test(message);
}

export default function ProfileSetupScreen({ user, onComplete }: ProfileSetupScreenProps) {
  const layout = useAuthLayout(false);

  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [availability, setAvailability] = useState<AvailabilityStatus>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCheckId = useRef(0);
  const [lastCheck, setLastCheck] = useState<{ name: string; status: AvailabilityStatus }>({
    name: '',
    status: 'idle',
  });
  const requestInFlight = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const checkAvailability = useStableCallback(async (name: string, checkId: number) => {
    // Rate limit check for username searches
    const limitCheck = rateLimiter.checkLimit('usernameCheck', user.id);
    if (!limitCheck.allowed) {
      return;
    }

    try {
      const free = await isUsernameAvailable(name, user.id);
      if (latestCheckId.current === checkId) {
        const nextStatus: AvailabilityStatus = free ? 'available' : 'taken';
        setAvailability(nextStatus);
        setLastCheck({ name, status: nextStatus });
        if (!free) {
          setFieldError(TAKEN_MESSAGE);
        }
      }
    } catch {
      if (latestCheckId.current === checkId) {
        setAvailability('idle');
      }
    }
  });

  const handleUsernameChange = useCallback(
    (text: string) => {
      setUsername(text);
      setErrorMessage('');

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      const trimmed = text.trim();
      const validationError = validateUsername(trimmed);

      if (validationError) {
        setFieldError(validationError);
        setAvailability('idle');
        return;
      }

      setFieldError('');

      if (trimmed.toLowerCase() === lastCheck.name.toLowerCase()) {
        setAvailability(lastCheck.status);
        if (lastCheck.status === 'taken') {
          setFieldError(TAKEN_MESSAGE);
        }
        return;
      }

      setAvailability('checking');
      const checkId = ++latestCheckId.current;
      debounceTimer.current = setTimeout(() => {
        checkAvailability(trimmed, checkId);
      }, 350);
    },
    [checkAvailability, lastCheck]
  );

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const handleSave = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const name = username.trim();
    const validationError = validateUsername(name);
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    requestInFlight.current = true;
    setIsSaving(true);
    setErrorMessage('');

    try {
      const available = await isUsernameAvailable(name, user.id);
      if (!available) {
        setLastCheck({ name, status: 'taken' });
        setFieldError(TAKEN_MESSAGE);
        return;
      }

      const result = await saveUsername(user, name);
      if (result === 'taken') {
        setLastCheck({ name, status: 'taken' });
        setFieldError(TAKEN_MESSAGE);
        return;
      }

      onComplete(name);
    } catch (err: unknown) {
      setErrorMessage(isNetworkError(err) ? CONNECTION_MESSAGE : SAVE_FAILED_MESSAGE);
    } finally {
      requestInFlight.current = false;
      setIsSaving(false);
    }
  });

  const handleSignOut = useStableCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      requestInFlight.current = false;
      setIsSigningOut(false);
    }
  });

  const busy = isSaving || isSigningOut;
  const hint =
    availability === 'checking'
      ? 'Checking if username is free...'
      : availability === 'available'
        ? 'Username is available!'
        : `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters: letters, numbers and _`;
  const shownError = fieldError || (availability === 'taken' ? TAKEN_MESSAGE : '');

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <NoirBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: layout.paddingTop,
              paddingBottom: layout.paddingBottom,
              paddingHorizontal: layout.paddingHorizontal,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <AuthHeader layout={layout} subtitle="CHOOSE YOUR USERNAME" />

          <View style={styles.formWrapper}>
            <AuthCard>
              <Text style={styles.instructionText} maxFontSizeMultiplier={1.3}>
                Choose a unique username that other players will see during games.
              </Text>

              <AuthErrorBanner message={errorMessage} />

              <AuthTextInput
                ref={inputRef}
                label="USERNAME"
                variant="gold"
                error={shownError}
                hint={hint}
                hintTone={availability === 'available' ? 'success' : 'muted'}
                renderIcon={renderUserIcon}
                placeholder="e.g. ShadowPlayer"
                value={username}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                maxLength={USERNAME_MAX_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleSave}
                editable={!busy}
                autoFocus
              />

              <AuthPrimaryButton
                label="CONFIRM USERNAME"
                onPress={handleSave}
                loading={isSaving}
                disabled={busy || availability === 'taken' || !!shownError}
              />
            </AuthCard>
          </View>

          {/* Footer */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText} maxFontSizeMultiplier={1.3}>
              Not you?
            </Text>
            <TouchableOpacity onPress={handleSignOut} disabled={busy} activeOpacity={0.7}>
              <Text style={styles.footerLink} maxFontSizeMultiplier={1.3}>
                {isSigningOut ? ' Logging out...' : ' Log out'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070e1a',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formWrapper: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    marginVertical: 10,
  },
  instructionText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  footerContainer: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 10,
  },
  footerText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  footerLink: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
  },
});
