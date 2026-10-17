import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { getFriendlyAuthError } from '../../lib/authHelpers';
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
  renderLockIcon,
  useAuthLayout,
} from '../../components/auth';
import { useStableCallback } from '../../hooks/useStableCallback';

const MAX_FONT_SCALE = 1.3;

interface LoginScreenProps {
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
  onLoginSuccess?: (user: User) => Promise<void> | void;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginScreen({
  onNavigateToSignUp,
  onNavigateToForgotPassword,
  onLoginSuccess,
}: LoginScreenProps) {
  const layout = useAuthLayout(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [noAccountFound, setNoAccountFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  const passwordInputRef = useRef<TextInput>(null);
  const requestInFlight = useRef(false);

  const clearFormError = useCallback(() => {
    setFormError((prev) => (prev ? '' : prev));
    setNoAccountFound((prev) => (prev ? false : prev));
  }, []);

  const handleEmailChange = useCallback(
    (text: string) => {
      setEmail(text);
      setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
      clearFormError();
    },
    [clearFormError]
  );

  const handlePasswordChange = useCallback(
    (text: string) => {
      setPassword(text);
      setFieldErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev));
      clearFormError();
    },
    [clearFormError]
  );

  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const eyeToggle = useMemo(
    () => <EyeToggle visible={showPassword} onToggle={togglePasswordVisibility} />,
    [showPassword, togglePasswordVisibility]
  );

  const handleLogin = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const trimmedInput = email.trim();
    if (!trimmedInput) {
      setFieldErrors({ email: 'Enter your email address or username.' });
      return;
    }

    if (!password) {
      setFieldErrors({ password: 'Enter your secret passcode.' });
      return;
    }

    requestInFlight.current = true;
    setLoading(true);
    setFormError('');
    setNoAccountFound(false);

    let loginEmail = trimmedInput.toLowerCase();

    if (!trimmedInput.includes('@')) {
      try {
        const rpc = supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: string | null; error: { message?: string } | null }>;
        const { data: resolvedEmail, error: lookupError } = await rpc('get_email_for_username', {
          p_username: trimmedInput,
        });

        if (lookupError || !resolvedEmail) {
          setFormError("We couldn't find an account with that username. Please check and try again.");
          setLoading(false);
          requestInFlight.current = false;
          return;
        }
        loginEmail = resolvedEmail;
      } catch {
        // Fall back to loginEmail as typed
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) {
        const record = rateLimiter.recordAttempt('login', loginEmail);
        if (!record.allowed && record.message) {
          setFormError(record.message);
        } else {
          setFormError(getFriendlyAuthError(error, 'Incorrect email or passcode.'));
        }
      } else if (data.session?.user) {
        rateLimiter.reset('login', loginEmail);
        await onLoginSuccess?.(data.session.user);
      }
    } catch {
      setFormError('Network connection issue. Please check your connection.');
    } finally {
      setLoading(false);
      requestInFlight.current = false;
    }
  });

  const handleGoogleLogin = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const userKey = email.trim().toLowerCase() || 'google';
    const limitCheck = rateLimiter.checkLimit('login', userKey);
    if (!limitCheck.allowed) {
      setFormError(limitCheck.message || 'Too many attempts.');
      return;
    }

    setFormError('');
    setFieldErrors({});
    setNoAccountFound(false);
    requestInFlight.current = true;
    setGoogleLoading(true);

    try {
      const session = await signInWithGoogle();
      if (session?.user) {
        rateLimiter.reset('login', userKey);
        await onLoginSuccess?.(session.user);
      } else {
        const { data: currentAuth } = await supabase.auth.getSession();
        if (currentAuth?.session?.user) {
          rateLimiter.reset('login', userKey);
          await onLoginSuccess?.(currentAuth.session.user);
        }
      }
    } catch (err: unknown) {
      rateLimiter.recordAttempt('login', userKey);
      const raw = err instanceof Error ? err.message : String(err ?? '');
      const friendly = getFriendlyAuthError(err, '');
      setFormError(friendly || (raw ? `Google sign-in failed: ${raw}` : "Google sign-in didn't work. Please try again."));
    } finally {
      setGoogleLoading(false);
      requestInFlight.current = false;
    }
  });

  const handleGuestLogin = useStableCallback(async () => {
    if (requestInFlight.current) return;

    setFormError('');
    setFieldErrors({});
    setNoAccountFound(false);
    requestInFlight.current = true;
    setGuestLoading(true);

    try {
      // 1. Try Supabase Anonymous Auth
      const { data, error } = await supabase.auth.signInAnonymously();

      if (!error && data.session?.user) {
        await onLoginSuccess?.(data.session.user);
        return;
      }

      // 2. Fallback: Auto-generate a unique guest account if anonymous auth is disabled
      const rand = Math.floor(1000 + Math.random() * 9000);
      const uniqueGuestEmail = `guest_${Date.now()}_${rand}@mafia.local`;
      const uniqueGuestUsername = `Guest_${rand}`;
      const uniqueGuestPassword = `GuestPass#${Date.now()}`;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: uniqueGuestEmail,
        password: uniqueGuestPassword,
        options: {
          data: {
            username: uniqueGuestUsername,
          },
        },
      });

      if (signUpError) {
        setFormError(getFriendlyAuthError(signUpError, 'Failed to sign in as Guest. Please try creating an account.'));
      } else if (signUpData.session?.user) {
        await onLoginSuccess?.(signUpData.session.user);
      } else if (signUpData.user) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: uniqueGuestEmail,
          password: uniqueGuestPassword,
        });
        if (signInData.session?.user) {
          await onLoginSuccess?.(signInData.session.user);
        } else {
          setFormError(getFriendlyAuthError(signInErr, 'Failed to sign in as Guest.'));
        }
      }
    } catch (err: unknown) {
      setFormError(getFriendlyAuthError(err, 'Guest login error. Please try again.'));
    } finally {
      setGuestLoading(false);
      requestInFlight.current = false;
    }
  });

  const busy = loading || googleLoading || guestLoading;

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
          <AuthHeader layout={layout} />

          {/* Form & Character Art */}
          <View style={styles.formWrapper}>
            <CharactersStage width={layout.charactersWidth} height={layout.charactersHeight} />

            <AuthCard>
              <AuthTextInput
                label="EMAIL OR USERNAME"
                variant="gold"
                error={fieldErrors.email}
                renderIcon={renderEmailIcon}
                placeholder="agent@domain.com or username"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                editable={!busy}
              />

              <AuthTextInput
                ref={passwordInputRef}
                label="SECRET PASSCODE"
                variant="gold"
                error={fieldErrors.password}
                renderIcon={renderLockIcon}
                rightAccessory={eyeToggle}
                placeholder="••••••••"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!busy}
              />

              {noAccountFound ? (
                <View style={styles.noAccountBox}>
                  <Text style={styles.noAccountText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    No account with this Google profile yet.
                  </Text>
                  <TouchableOpacity
                    style={styles.noAccountButton}
                    onPress={onNavigateToSignUp}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.noAccountButtonText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      GO TO SIGN UP
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <AuthErrorBanner message={formError} />

              {/* Primary Login Button */}
              <AuthPrimaryButton
                label="LOGIN"
                onPress={handleLogin}
                loading={loading}
                disabled={busy}
              />

              <GoogleSignInButton
                onPress={handleGoogleLogin}
                loading={googleLoading}
                disabled={busy}
              />

              <TouchableOpacity
                style={styles.guestButton}
                onPress={handleGuestLogin}
                disabled={busy}
                activeOpacity={0.8}
              >
                {guestLoading ? (
                  <ActivityIndicator size="small" color="#fde68a" />
                ) : (
                  <Text style={styles.guestButtonText}>PLAY AS GUEST 🎭</Text>
                )}
              </TouchableOpacity>
            </AuthCard>
          </View>

          {/* Footer Navigation Links */}
          <View style={styles.footerContainer}>
            <TouchableOpacity
              onPress={onNavigateToForgotPassword}
              disabled={busy}
              activeOpacity={0.7}
              style={styles.forgotTouch}
              accessibilityRole="button"
            >
              <Text style={styles.forgotText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Forgot Password?
              </Text>
            </TouchableOpacity>

            <View style={styles.signUpGroup}>
              <Text style={styles.needAccountText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Need an account?
              </Text>
              <TouchableOpacity
                onPress={onNavigateToSignUp}
                disabled={busy}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.signUpText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  SIGN UP
                </Text>
              </TouchableOpacity>
            </View>
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

  /* Characters Standing Stage */
  charactersStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: -1,
    zIndex: 10,
  },

  /* Form Card & Inputs */
  formCard: {
    width: '100%',
    backgroundColor: 'rgba(11, 18, 32, 0.94)',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(253, 230, 138, 0.28)',
    shadowColor: '#000000',
    shadowOpacity: 0.85,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  noAccountBox: {
    backgroundColor: 'rgba(153, 27, 27, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.45)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  noAccountText: {
    color: '#fecaca',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  noAccountButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  noAccountButtonText: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  footerContainer: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 10,
  },
  forgotTouch: {
    paddingVertical: 6,
  },
  forgotText: {
    color: '#fde68a',
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  signUpGroup: {
    alignItems: 'flex-end',
  },
  needAccountText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  signUpText: {
    color: '#fde68a',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  guestButton: {
    width: '100%',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(253, 230, 138, 0.4)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  guestButtonText: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});
