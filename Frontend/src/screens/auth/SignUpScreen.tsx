import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { signInWithGoogle } from '../../lib/auth';
import {
  MIN_PASSWORD_LENGTH,
  getFriendlyAuthError,
  validateEmail,
  validateNewPassword,
} from '../../lib/authHelpers';
import { validateUsername } from '../../lib/profile';
import { rateLimiter } from '../../lib/rateLimit';
import {
  AuthCard,
  AuthErrorBanner,
  AuthHeader,
  AuthPrimaryButton,
  AuthTextInput,
  CharactersStage,
  EyeToggle,
  GoogleSignInButton,
  NoirBackground,
  renderEmailIcon,
  renderLockCheckIcon,
  renderLockIcon,
  renderUserIcon,
  useAuthLayout,
} from '../../components/auth';
import { useStableCallback } from '../../hooks/useStableCallback';

const MAX_FONT_SCALE = 1.3;

interface SignUpScreenProps {
  onNavigateToLogin?: () => void;
  onSignUpSuccess?: (user: User) => Promise<void> | void;
}

type FieldName = 'username' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<FieldName, string>>;

export default function SignUpScreen({ onNavigateToLogin, onSignUpSuccess }: SignUpScreenProps) {
  const layout = useAuthLayout(true);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const requestInFlight = useRef(false);

  const handleUsernameChange = useCallback((text: string) => {
    setUsername(text);
    setFieldErrors((prev) => (prev.username ? { ...prev, username: undefined } : prev));
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    setFieldErrors((prev) =>
      prev.password || prev.confirmPassword
        ? { ...prev, password: undefined, confirmPassword: undefined }
        : prev
    );
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  const handleConfirmChange = useCallback((text: string) => {
    setConfirmPassword(text);
    setFieldErrors((prev) => (prev.confirmPassword ? { ...prev, confirmPassword: undefined } : prev));
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  const focusEmail = useCallback(() => emailRef.current?.focus(), []);
  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);
  const focusConfirm = useCallback(() => confirmPasswordRef.current?.focus(), []);
  const toggleShowPassword = useCallback(() => setShowPassword((prev) => !prev), []);

  const eyeToggle = useMemo(
    () => <EyeToggle visible={showPassword} onToggle={toggleShowPassword} />,
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

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Rate limiting check
    const limitCheck = rateLimiter.checkLimit('signup', trimmedEmail || 'anonymous');
    if (!limitCheck.allowed) {
      setFormError(limitCheck.message || 'Too many attempts. Please wait a moment.');
      return;
    }

    const errors = validate();
    setFieldErrors(errors);
    setFormError('');
    if (Object.values(errors).some(Boolean)) return;

    requestInFlight.current = true;
    setLoading(true);

    try {
      // 1. Check if username is already taken in Supabase profiles
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', trimmedUsername)
        .maybeSingle();

      if (existingUser) {
        setFieldErrors({ username: 'This codename is already taken. Choose another.' });
        setLoading(false);
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
        rateLimiter.recordAttempt('signup', trimmedEmail);
        setFormError(
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

        rateLimiter.reset('signup', trimmedEmail);
        await onSignUpSuccess?.(data.session.user);
      } else if (data.user && data.user.identities?.length === 0) {
        setFormError('An account with this email already exists. Try logging in instead.');
      } else if (data.user) {
        // Record profile entry for email confirmation flow
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
        rateLimiter.reset('signup', trimmedEmail);
        setConfirmationSentTo(trimmedEmail);
      }
    } catch {
      setFormError('Network connection issue. Please check your connection and try again.');
    } finally {
      setLoading(false);
      requestInFlight.current = false;
    }
  });

  const handleGoogleSignUp = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const limitCheck = rateLimiter.checkLimit('signup', 'google_oauth');
    if (!limitCheck.allowed) {
      setFormError(limitCheck.message || 'Too many attempts.');
      return;
    }

    setFormError('');
    setFieldErrors({});
    requestInFlight.current = true;
    setGoogleLoading(true);

    try {
      const session = await signInWithGoogle();
      if (session?.user) {
        rateLimiter.reset('signup', 'google_oauth');
        await onSignUpSuccess?.(session.user);
      } else {
        const { data: currentAuth } = await supabase.auth.getSession();
        if (currentAuth?.session?.user) {
          rateLimiter.reset('signup', 'google_oauth');
          await onSignUpSuccess?.(currentAuth.session.user);
        }
      }
    } catch (err: unknown) {
      rateLimiter.recordAttempt('signup', 'google_oauth');
      setFormError(getFriendlyAuthError(err, 'Google sign up failed. Please try again.'));
    } finally {
      setGoogleLoading(false);
      requestInFlight.current = false;
    }
  });

  const busy = loading || googleLoading;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <NoirBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Title */}
          <AuthHeader layout={layout} subtitle="JOIN THE UNDERWORLD" />

          {/* Form & Character Art */}
          <View style={styles.formWrapper}>
            <CharactersStage width={layout.charactersWidth} height={layout.charactersHeight} />

            <AuthCard>
              {confirmationSentTo ? (
                <View style={styles.confirmationBox}>
                  <Text style={styles.confirmationTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    VERIFICATION SENT
                  </Text>
                  <Text style={styles.confirmationText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    We sent a verification email to{' '}
                    <Text style={styles.confirmationEmail}>{confirmationSentTo}</Text>. Confirm your
                    email to complete activation.
                  </Text>
                  <TouchableOpacity
                    style={styles.loginRedirectButton}
                    onPress={onNavigateToLogin}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={styles.loginRedirectButtonText}
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                    >
                      GO TO LOGIN
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <AuthTextInput
                    ref={usernameRef}
                    label="CODENAME"
                    variant="gold"
                    error={fieldErrors.username}
                    renderIcon={renderUserIcon}
                    placeholder="Enter unique alias"
                    value={username}
                    onChangeText={handleUsernameChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    returnKeyType="next"
                    onSubmitEditing={focusEmail}
                    editable={!busy}
                  />

                  <AuthTextInput
                    ref={emailRef}
                    label="EMAIL ADDRESS"
                    variant="gold"
                    error={fieldErrors.email}
                    renderIcon={renderEmailIcon}
                    placeholder="agent@domain.com"
                    value={email}
                    onChangeText={handleEmailChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={focusPassword}
                    editable={!busy}
                  />

                  <AuthTextInput
                    ref={passwordRef}
                    label="SECRET PASSCODE"
                    variant="gold"
                    error={fieldErrors.password}
                    renderIcon={renderLockIcon}
                    rightAccessory={eyeToggle}
                    placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
                    value={password}
                    onChangeText={handlePasswordChange}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    onSubmitEditing={focusConfirm}
                    editable={!busy}
                  />

                  <AuthTextInput
                    ref={confirmPasswordRef}
                    label="CONFIRM PASSCODE"
                    variant="gold"
                    error={fieldErrors.confirmPassword}
                    renderIcon={renderLockCheckIcon}
                    rightAccessory={eyeToggle}
                    placeholder="Repeat secret passcode"
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

                  {/* Error banner */}
                  <AuthErrorBanner message={formError} />

                  {/* Primary Create Account Button */}
                  <AuthPrimaryButton
                    label="CREATE ACCOUNT"
                    onPress={handleSignUp}
                    loading={loading}
                    disabled={busy}
                  />

                  <GoogleSignInButton
                    label="SIGN UP WITH GOOGLE"
                    onPress={handleGoogleSignUp}
                    loading={googleLoading}
                    disabled={busy}
                  />
                </>
              )}
            </AuthCard>
          </View>

          {/* Footer Navigation Link */}
          <View style={styles.footerContainer}>
            <Text style={styles.haveAccountText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Already have an account?
            </Text>
            <TouchableOpacity onPress={onNavigateToLogin} disabled={busy} activeOpacity={0.7}>
              <Text style={styles.logInText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                LOG IN
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
  keyboardAvoid: {
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
    marginVertical: 2,
  },
  confirmationBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  confirmationTitle: {
    color: '#34d399',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  confirmationText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmationEmail: {
    color: '#fde68a',
    fontWeight: '700',
  },
  loginRedirectButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  loginRedirectButtonText: {
    color: '#fef08a',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  footerContainer: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 6,
  },
  haveAccountText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  logInText: {
    color: '#fde68a',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});
