import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
import { signInWithGoogle } from '../../lib/auth';
import {
  MIN_PASSWORD_LENGTH,
  getFriendlyAuthError,
  validateEmail,
  validateNewPassword,
} from '../../lib/authHelpers';
import { validateUsername } from '../../lib/profile';
import { AuthTextInput } from '../../components/auth/AuthTextInput';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { useStableCallback } from '../../hooks/useStableCallback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SignUpScreenProps {
  onNavigateToLogin?: () => void;
  onSignUpSuccess?: (user: User) => Promise<void> | void;
}

type FieldName = 'username' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<FieldName, string>>;

const ShowHideToggle = memo(function ShowHideToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={styles.showToggle}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide passwords' : 'Show passwords'}
    >
      <Text style={styles.showToggleText}>{visible ? 'HIDE' : 'SHOW'}</Text>
    </TouchableOpacity>
  );
});

export default function SignUpScreen({ onNavigateToLogin, onSignUpSuccess }: SignUpScreenProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const requestInFlight = useRef(false);

  // Entrance animation
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(25));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleUsernameChange = useCallback((text: string) => {
    setUsername(text);
    setFieldErrors((prev) => (prev.username ? { ...prev, username: undefined } : prev));
    setErrorMessage((prev) => (prev ? '' : prev));
  }, []);

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
    setErrorMessage((prev) => (prev ? '' : prev));
  }, []);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    setFieldErrors((prev) =>
      prev.password || prev.confirmPassword
        ? { ...prev, password: undefined, confirmPassword: undefined }
        : prev
    );
    setErrorMessage((prev) => (prev ? '' : prev));
  }, []);

  const handleConfirmChange = useCallback((text: string) => {
    setConfirmPassword(text);
    setFieldErrors((prev) => (prev.confirmPassword ? { ...prev, confirmPassword: undefined } : prev));
    setErrorMessage((prev) => (prev ? '' : prev));
  }, []);

  const focusEmail = useCallback(() => emailRef.current?.focus(), []);
  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);
  const focusConfirm = useCallback(() => confirmPasswordRef.current?.focus(), []);
  const toggleShowPassword = useCallback(() => setShowPassword((prev) => !prev), []);

  const showHideToggle = useMemo(
    () => <ShowHideToggle visible={showPassword} onToggle={toggleShowPassword} />,
    [showPassword, toggleShowPassword]
  );

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const usernameError = validateUsername(username);
    if (usernameError) errors.username = usernameError;

    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;

    const passwordError = validateNewPassword(password);
    if (passwordError) errors.password = passwordError;

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm your passcode.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passcodes do not match.';
    }
    return errors;
  };

  const handleSignUp = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const errors = validate();
    setFieldErrors(errors);
    setErrorMessage('');
    if (Object.values(errors).some(Boolean)) return;

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    requestInFlight.current = true;
    setIsLoading(true);

    try {
      // 1. Check if username is already taken in Supabase
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', trimmedUsername)
        .maybeSingle();

      if (existingUser) {
        setFieldErrors({ username: 'This username is already taken. Choose another.' });
        setIsLoading(false);
        requestInFlight.current = false;
        return;
      }

      // 2. Sign up with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            username: trimmedUsername,
          },
        },
      });

      if (error) {
        setErrorMessage(
          getFriendlyAuthError(error, "We couldn't create your account. Please try again.")
        );
      } else if (data.session?.user) {
        // Save profile record in Supabase profiles table
        try {
          await supabase.from('profiles').upsert({
            id: data.session.user.id,
            email: trimmedEmail,
            username: trimmedUsername,
            updated_at: new Date().toISOString(),
          } as never);
        } catch {
          // ignore
        }

        await onSignUpSuccess?.(data.session.user);
      } else if (data.user && data.user.identities?.length === 0) {
        setErrorMessage('An account with this email already exists. Try logging in instead.');
      } else if (data.user) {
        // Record profile entry
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: trimmedEmail,
            username: trimmedUsername,
            updated_at: new Date().toISOString(),
          } as never);
        } catch {
          // ignore
        }
        setConfirmationSentTo(trimmedEmail);
      }
    } catch (err: unknown) {
      setErrorMessage(
        getFriendlyAuthError(err, "We couldn't create your account. Please try again.")
      );
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  });

  const handleGoogleSignUp = useStableCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setGoogleLoading(true);
    setErrorMessage('');
    try {
      const session = await signInWithGoogle();
      if (session?.user) {
        await onSignUpSuccess?.(session.user);
      }
    } catch (err: unknown) {
      setErrorMessage(getFriendlyAuthError(err, "Google sign-up didn't work. Please try again."));
    } finally {
      requestInFlight.current = false;
      setGoogleLoading(false);
    }
  });

  const busy = isLoading || googleLoading;

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
          keyboardDismissMode="on-drag"
        >
          <Animated.View
            style={[
              styles.contentCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.badgeRow}>
                <View style={styles.crimsonDot} />
                <Text style={styles.badgeText}>JOIN THE SYNDICATE</Text>
                <View style={styles.blueDot} />
              </View>
              <Text style={styles.title}>
                {confirmationSentTo ? 'CHECK YOUR EMAIL' : 'REGISTER'}
              </Text>
              <Text style={styles.subtitle}>
                {confirmationSentTo
                  ? `We sent a confirmation link to ${confirmationSentTo}. Confirm your email, then log in.`
                  : 'Create your operative account and choose your alias.'}
              </Text>
            </View>

            {/* Error Message */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {confirmationSentTo ? (
              <View style={styles.form}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onNavigateToLogin}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>GO TO LOGIN</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.form}>
                <AuthTextInput
                  ref={usernameRef}
                  label="Operative Codename"
                  error={fieldErrors.username}
                  placeholder="e.g. Vito or InspectorMike"
                  value={username}
                  onChangeText={handleUsernameChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={focusEmail}
                  editable={!busy}
                />

                <AuthTextInput
                  ref={emailRef}
                  label="Email Address"
                  error={fieldErrors.email}
                  placeholder="operative@domain.com"
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={focusPassword}
                  editable={!busy}
                />

                <AuthTextInput
                  ref={passwordRef}
                  label="Secret Passcode"
                  error={fieldErrors.password}
                  rightAccessory={showHideToggle}
                  placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={focusConfirm}
                  editable={!busy}
                />

                <AuthTextInput
                  ref={confirmPasswordRef}
                  label="Confirm Passcode"
                  error={fieldErrors.confirmPassword}
                  placeholder="Repeat passcode"
                  value={confirmPassword}
                  onChangeText={handleConfirmChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={handleSignUp}
                  editable={!busy}
                />

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.buttonDisabled]}
                  onPress={handleSignUp}
                  activeOpacity={0.85}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy, busy: isLoading }}
                >
                  <View style={styles.buttonContent}>
                    {isLoading ? (
                      <ActivityIndicator
                        color="#07090e"
                        size="small"
                        style={styles.buttonSpinner}
                      />
                    ) : null}
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'ENROLLING...' : 'CREATE ACCOUNT'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>OR</Text>
                  <View style={styles.orLine} />
                </View>

                <GoogleSignInButton
                  label="SIGN UP WITH GOOGLE"
                  onPress={handleGoogleSignUp}
                  loading={googleLoading}
                  disabled={busy}
                  style={styles.googleButton}
                />
              </View>
            )}

            {/* Footer Navigation */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <TouchableOpacity onPress={onNavigateToLogin} disabled={busy} activeOpacity={0.7}>
                <Text style={styles.loginLink}> Log In</Text>
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
    paddingHorizontal: Math.max(14, SCREEN_WIDTH * 0.05),
    paddingVertical: 24,
  },
  contentCard: {
    backgroundColor: '#111622',
    borderRadius: 22,
    padding: SCREEN_WIDTH < 360 ? 16 : 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxWidth: 420,
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
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  crimsonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e11d48',
    marginRight: 8,
  },
  blueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38bdf8',
    marginLeft: 8,
  },
  badgeText: {
    color: '#94a3b8',
    fontSize: SCREEN_WIDTH < 360 ? 10 : 11,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  title: {
    color: '#f8fafc',
    fontSize: SCREEN_WIDTH < 360 ? 26 : 30,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginBottom: 4,
    textShadowColor: 'rgba(56, 189, 248, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: '#64748b',
    fontSize: SCREEN_WIDTH < 360 ? 11.5 : 12.5,
    fontWeight: '500',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 1,
    borderColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#ff4d6d',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  showToggle: {
    paddingVertical: 4,
  },
  showToggleText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSpinner: {
    marginRight: 8,
  },
  primaryButton: {
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    height: Math.max(48, Math.min(52, SCREEN_WIDTH * 0.13)),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#07090e',
    fontSize: SCREEN_WIDTH < 360 ? 13.5 : 14.5,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e293b',
  },
  orText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginHorizontal: 12,
  },
  googleButton: {
    marginTop: 14,
    borderRadius: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  footerText: {
    color: '#94a3b8',
    fontSize: SCREEN_WIDTH < 360 ? 12.5 : 13.5,
  },
  loginLink: {
    color: '#38bdf8',
    fontSize: SCREEN_WIDTH < 360 ? 13 : 14,
    fontWeight: '700',
  },
});
