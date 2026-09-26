import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { supabase } from '../../lib/supabase';
import {
  MIN_PASSWORD_LENGTH,
  getFriendlyAuthError,
  validateEmail,
  validateNewPassword,
} from '../../lib/authHelpers';
import { AuthTextInput } from '../../components/auth/AuthTextInput';
import { useStableCallback } from '../../hooks/useStableCallback';

interface SignUpScreenProps {
  onNavigateToLogin?: () => void;
  /** Called only when sign-up returned a session (i.e. email confirmation is disabled). */
  onSignUpSuccess?: (alias: string) => void;
}

type FieldName = 'alias' | 'email' | 'password' | 'confirmPassword';
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
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  // Synchronous guard so rapid double taps can't send two sign-up requests.
  const requestInFlight = useRef(false);

  // Entrance animation (native driver, runs once on mount)
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

  // Stable handlers so each memoized field only re-renders when its own props change.
  const clearFieldError = useCallback((field: FieldName) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setErrorMessage((prev) => (prev ? '' : prev));
  }, []);
  const handleAliasChange = useCallback(
    (text: string) => {
      setAlias(text);
      clearFieldError('alias');
    },
    [clearFieldError]
  );
  const handleEmailChange = useCallback(
    (text: string) => {
      setEmail(text);
      clearFieldError('email');
    },
    [clearFieldError]
  );
  const handlePasswordChange = useCallback(
    (text: string) => {
      setPassword(text);
      clearFieldError('password');
    },
    [clearFieldError]
  );
  const handleConfirmChange = useCallback(
    (text: string) => {
      setConfirmPassword(text);
      clearFieldError('confirmPassword');
    },
    [clearFieldError]
  );

  const focusEmail = useCallback(() => emailRef.current?.focus(), []);
  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);
  const focusConfirm = useCallback(() => confirmPasswordRef.current?.focus(), []);
  const togglePassword = useCallback(() => setShowPassword((prev) => !prev), []);
  const showHideToggle = useMemo(
    () => <ShowHideToggle visible={showPassword} onToggle={togglePassword} />,
    [showPassword, togglePassword]
  );

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!alias.trim()) errors.alias = 'Please choose your in-game alias.';
    const emailError = validateEmail(email.trim());
    if (emailError) errors.email = emailError;
    const passwordError = validateNewPassword(password);
    if (passwordError) errors.password = passwordError;
    if (!confirmPassword) errors.confirmPassword = 'Please repeat your password.';
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  };

  const handleSignUp = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const errors = validate();
    setFieldErrors(errors);
    setErrorMessage('');
    if (Object.values(errors).some(Boolean)) return;

    const trimmedAlias = alias.trim();
    const trimmedEmail = email.trim();

    requestInFlight.current = true;
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            username: trimmedAlias,
          },
        },
      });

      if (error) {
        setErrorMessage(
          getFriendlyAuthError(error, "We couldn't create your account. Please try again.")
        );
      } else if (data.session) {
        // Email confirmation is off: the user is signed in right away.
        onSignUpSuccess?.(trimmedAlias);
      } else if (data.user && data.user.identities?.length === 0) {
        // With confirmation on, Supabase returns a user without identities for an existing email.
        setErrorMessage('An account with this email already exists. Try logging in instead.');
      } else {
        // Email confirmation is on: no session until the user clicks the link.
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
                <Text style={styles.badgeText}>NEW OPERATIVE</Text>
                <View style={styles.blueDot} />
              </View>
              <Text style={styles.title}>
                {confirmationSentTo ? 'CHECK YOUR EMAIL' : 'REGISTER'}
              </Text>
              <Text style={styles.subtitle}>
                {confirmationSentTo
                  ? `We sent a confirmation link to ${confirmationSentTo}. Confirm your email, then log in.`
                  : 'Create your alias in the underground'}
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
                  label="In-Game Alias"
                  error={fieldErrors.alias}
                  placeholder="e.g. ShadowVito or InspectorHolt"
                  value={alias}
                  onChangeText={handleAliasChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={20}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={focusEmail}
                  editable={!isLoading}
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
                  textContentType="username"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={focusPassword}
                  editable={!isLoading}
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
                  editable={!isLoading}
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
                  editable={!isLoading}
                />

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleSignUp}
                  activeOpacity={0.85}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLoading, busy: isLoading }}
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
                      {isLoading ? 'ENROLLING ALIAS...' : 'CREATE IDENTITY'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Footer Navigation */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an alias?</Text>
              <TouchableOpacity
                onPress={onNavigateToLogin}
                disabled={isLoading}
                activeOpacity={0.7}
              >
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
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  contentCard: {
    backgroundColor: '#111622',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
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
  blueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38bdf8',
    marginLeft: 8,
  },
  badgeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 4,
    textShadowColor: 'rgba(56, 189, 248, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
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
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
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
  loginLink: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '700',
  },
});
