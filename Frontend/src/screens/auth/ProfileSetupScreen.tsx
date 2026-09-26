import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { isNetworkError } from '../../lib/authHelpers';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isUsernameAvailable,
  saveUsername,
  validateUsername,
} from '../../lib/profile';
import { AuthTextInput } from '../../components/auth/AuthTextInput';
import { useStableCallback } from '../../hooks/useStableCallback';

interface ProfileSetupScreenProps {
  /** The signed-in user who still needs a username. */
  user: User;
  /** Called after the username was saved. */
  onComplete: (username: string) => void;
}

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'unknown';
type CheckResult = { name: string; status: 'available' | 'taken' | 'unknown' };

const AVAILABILITY_DEBOUNCE_MS = 500;
const TAKEN_MESSAGE = 'Sorry, that username is already taken. Please try another one.';
const CONNECTION_MESSAGE =
  "We can't reach the server. Check your internet connection and try again.";
const SAVE_FAILED_MESSAGE = "We couldn't save your username. Please try again.";

export default function ProfileSetupScreen({ user, onComplete }: ProfileSetupScreenProps) {
  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  // Result of the last availability lookup, tied to the name it was made for.
  const [lastCheck, setLastCheck] = useState<CheckResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const requestInFlight = useRef(false);

  // Entrance animation (native driver, runs once on mount)
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(25));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const trimmedName = username.trim();
  const isValidName = validateUsername(trimmedName) === null;
  const availability: Availability = !isValidName
    ? 'idle'
    : lastCheck?.name === trimmedName
      ? lastCheck.status
      : 'checking';

  // Live availability check, debounced so we don't query on every keystroke.
  // Answers for an older name are ignored because `availability` only uses a matching result.
  useEffect(() => {
    if (!isValidName) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let status: CheckResult['status'];
      try {
        status = (await isUsernameAvailable(trimmedName, user.id)) ? 'available' : 'taken';
      } catch {
        // Not fatal: we check again when the user taps the button.
        status = 'unknown';
      }
      if (!cancelled) setLastCheck({ name: trimmedName, status });
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedName, isValidName, user.id]);

  const handleUsernameChange = useCallback((text: string) => {
    setUsername(text);
    setFieldError((prev) => (prev ? '' : prev));
    setErrorMessage((prev) => (prev ? '' : prev));
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
      // Re-check right before saving; the unique constraint still guards against races.
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
      // App.tsx routes back to Login on the SIGNED_OUT event.
      await supabase.auth.signOut();
    } finally {
      requestInFlight.current = false;
      setIsSigningOut(false);
    }
  });

  const busy = isSaving || isSigningOut;
  const hint =
    availability === 'checking'
      ? 'Checking if this name is free…'
      : availability === 'available'
        ? 'Nice, this name is available.'
        : `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters: letters, numbers and _`;
  const shownError = fieldError || (availability === 'taken' ? TAKEN_MESSAGE : '');

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.contentCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.badgeRow}>
                <View style={styles.crimsonDot} />
                <Text style={styles.badgeText}>FINAL STEP</Text>
                <View style={styles.goldDot} />
              </View>
              <Text style={styles.title}>CHOOSE YOUR ALIAS</Text>
              <Text style={styles.subtitle}>
                This is the name other players will see at the table.
              </Text>
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <AuthTextInput
                label="Username"
                error={shownError}
                hint={hint}
                hintTone={availability === 'available' ? 'success' : 'muted'}
                placeholder="e.g. ShadowVito"
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

              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                onPress={handleSave}
                activeOpacity={0.85}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy: isSaving }}
              >
                <View style={styles.buttonContent}>
                  {isSaving ? (
                    <ActivityIndicator color="#07090e" size="small" style={styles.buttonSpinner} />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {isSaving ? 'SAVING...' : 'ENTER THE CITY'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Not you?</Text>
              <TouchableOpacity onPress={handleSignOut} disabled={busy} activeOpacity={0.7}>
                <Text style={styles.footerLink}>{isSigningOut ? ' Logging out…' : ' Log out'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  contentCard: {
    backgroundColor: '#111622',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.22)',
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  crimsonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e11d48',
    marginRight: 8,
  },
  goldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fde68a',
    marginLeft: 8,
  },
  badgeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  title: {
    color: '#fde68a',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginBottom: 6,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(217, 119, 6, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 19,
  },
  errorBanner: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 1,
    borderColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff4d6d',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#fde68a',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSpinner: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#07090e',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  footerText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  footerLink: {
    color: '#fde68a',
    fontSize: 14,
    fontWeight: '700',
  },
});
