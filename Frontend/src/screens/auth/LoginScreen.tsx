import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { signInWithGoogle } from '../../lib/auth';
import { getDisplayName, getFriendlyAuthError, validateEmail } from '../../lib/authHelpers';

const mafiaVsDetective = require('../../../assets/characters_transparent.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHARACTERS_WIDTH = Math.min(SCREEN_WIDTH * 0.74, 280);
const CHARACTERS_HEIGHT = CHARACTERS_WIDTH / (1042 / 499);

interface LoginScreenProps {
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
  /** Called only after Supabase returned a valid session. */
  onLoginSuccess?: (alias: string) => void;
}

type FieldErrors = { email?: string; password?: string };

export default function LoginScreen({
  onNavigateToSignUp,
  onNavigateToForgotPassword,
  onLoginSuccess,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');

  const passwordInputRef = useRef<TextInput>(null);
  // Synchronous guard so rapid double taps can't start two requests before re-render.
  const requestInFlight = useRef(false);

  const busy = loading || guestLoading || googleLoading;

  const runExclusive = async (setBusy: (value: boolean) => void, task: () => Promise<void>) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setFormError('');
    try {
      await task();
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const handleGoogleLogin = () =>
    runExclusive(setGoogleLoading, async () => {
      try {
        const session = await signInWithGoogle();
        // null means the user closed the browser: just stay on this screen.
        if (session?.user) {
          onLoginSuccess?.(getDisplayName(session.user));
        }
      } catch (err: unknown) {
        setFormError(getFriendlyAuthError(err, 'Google sign-in failed. Please try again.'));
      }
    });

  const handleLogin = () => {
    const trimmedEmail = email.trim();
    const errors: FieldErrors = {};
    const emailError = validateEmail(trimmedEmail);
    if (emailError) errors.email = emailError;
    if (!password) errors.password = 'Please enter your password.';
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setFormError('');
      return;
    }

    return runExclusive(setLoading, async () => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error || !data.session) {
          setFormError(getFriendlyAuthError(error, 'Login failed. Please try again.'));
          return;
        }

        onLoginSuccess?.(getDisplayName(data.session.user));
      } catch (err: unknown) {
        setFormError(getFriendlyAuthError(err));
      }
    });
  };

  const handleGuestLogin = () =>
    runExclusive(setGuestLoading, async () => {
      try {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
          setFormError(getFriendlyAuthError(error, 'Guest login failed. Please try again.'));
          return;
        }
        onLoginSuccess?.(getDisplayName(data.session.user));
      } catch (err: unknown) {
        setFormError(getFriendlyAuthError(err, 'Guest login failed. Please try again.'));
      }
    });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Atmospheric Dual-Tone Noir Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#081220" />
              <Stop offset="40%" stopColor="#060c16" />
              <Stop offset="100%" stopColor="#04070d" />
            </LinearGradient>
            <LinearGradient id="ambientRed" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#991b1b" stopOpacity="0.32" />
              <Stop offset="45%" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="ambientBlue" x1="100%" y1="0%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#0284c7" stopOpacity="0.30" />
              <Stop offset="45%" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambientRed)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambientBlue)" />
        </Svg>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Title: MAFIA */}
          <View style={styles.titleContainer}>
            <Text style={styles.titleText}>MAFIA</Text>
            <View style={styles.goldDivider}>
              <View style={styles.dividerDiamond} />
            </View>
            <Text style={styles.subtitleText}>TRUST NO ONE • SUSPECT EVERYONE</Text>
          </View>

          {/* Form & Characters Combined Unit */}
          <View style={styles.formWrapper}>
            {/* Character Stage: Mafia & Detective Standing Right on Login Box */}
            <View style={styles.charactersStage}>
              <Image source={mafiaVsDetective} style={styles.charactersImage} resizeMode="contain" />
            </View>

            {/* Login Box Container */}
            <View style={styles.formCard}>
              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <View
                  style={[
                    styles.inputBox,
                    focusedField === 'email' && styles.inputBoxFocused,
                    !!fieldErrors.email && styles.inputBoxError,
                  ]}
                >
                  <View style={styles.iconContainer}>
                    <Svg width="20" height="20" viewBox="0 0 24 24">
                      <Path
                        d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
                        fill={focusedField === 'email' ? '#fbbf24' : '#fde68a'}
                      />
                    </Svg>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      if (formError) setFormError('');
                    }}
                    placeholder="Enter your email"
                    placeholderTextColor="#64748b"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="username"
                    importantForAutofill="yes"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    editable={!busy}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                {fieldErrors.email ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text>
                ) : null}
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View
                  style={[
                    styles.inputBox,
                    focusedField === 'password' && styles.inputBoxFocused,
                    !!fieldErrors.password && styles.inputBoxError,
                  ]}
                >
                  <View style={styles.iconContainer}>
                    <Svg width="20" height="20" viewBox="0 0 24 24">
                      <Path
                        d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                        fill={focusedField === 'password' ? '#fbbf24' : '#fde68a'}
                      />
                    </Svg>
                  </View>
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.textInput}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }
                      if (formError) setFormError('');
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor="#64748b"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    importantForAutofill="yes"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    editable={!busy}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((prev) => !prev)}
                    style={styles.eyeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Svg width="20" height="20" viewBox="0 0 24 24">
                      {showPassword ? (
                        <Path
                          d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                          fill="#fde68a"
                        />
                      ) : (
                        <Path
                          d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
                          fill="#94a3b8"
                        />
                      )}
                    </Svg>
                  </TouchableOpacity>
                </View>
                {fieldErrors.password ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text>
                ) : null}
              </View>

              {/* Server / auth error */}
              {formError ? (
                <Text style={styles.formErrorText} accessibilityLiveRegion="polite">
                  {formError}
                </Text>
              ) : null}

              {/* Primary Login Button */}
              <TouchableOpacity
                style={[styles.loginButton, busy && !loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={busy}
                accessibilityState={{ disabled: busy, busy: loading }}
                activeOpacity={0.85}
              >
                <View style={styles.loginButtonBg}>
                  <Svg width="100%" height="100%" preserveAspectRatio="none">
                    <Defs>
                      <LinearGradient id="btnGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor="#dc2626" />
                        <Stop offset="50%" stopColor="#991b1b" />
                        <Stop offset="100%" stopColor="#580f0f" />
                      </LinearGradient>
                    </Defs>
                    <Rect
                      x="0"
                      y="0"
                      width="100%"
                      height="100%"
                      rx="14"
                      ry="14"
                      fill="url(#btnGrad)"
                    />
                  </Svg>
                </View>
                {loading ? (
                  <ActivityIndicator color="#fde68a" size="small" />
                ) : (
                  <Text style={styles.loginButtonText}>LOGIN</Text>
                )}
              </TouchableOpacity>

              {/* Google Sign-in Button */}
              <TouchableOpacity
                style={[styles.googleButton, busy && !googleLoading && styles.buttonDisabled]}
                onPress={handleGoogleLogin}
                disabled={busy}
                accessibilityState={{ disabled: busy, busy: googleLoading }}
                activeOpacity={0.85}
              >
                {googleLoading ? (
                  <ActivityIndicator color="#1e293b" size="small" />
                ) : (
                  <View style={styles.googleButtonInner}>
                    <Svg width="18" height="18" viewBox="0 0 24 24">
                      <Path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.86c2.26-2.09 3.68-5.17 3.68-9.09z"
                      />
                      <Path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.34 24 12 24z"
                      />
                      <Path
                        fill="#FBBC05"
                        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.98-3.1z"
                      />
                      <Path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.7 1.29 6.61l3.98 3.1C6.22 6.86 8.87 4.75 12 4.75z"
                      />
                    </Svg>
                    <Text style={styles.googleButtonText}>CONTINUE WITH GOOGLE</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Divider OR */}
              <View style={styles.orDividerContainer}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              {/* Play as Guest Option */}
              <TouchableOpacity
                style={[styles.guestButton, busy && !guestLoading && styles.buttonDisabled]}
                onPress={handleGuestLogin}
                disabled={busy}
                accessibilityState={{ disabled: busy, busy: guestLoading }}
                activeOpacity={0.75}
              >
                {guestLoading ? (
                  <ActivityIndicator color="#cbd5e1" size="small" />
                ) : (
                  <Text style={styles.guestButtonText}>PLAY AS GUEST</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer Navigation Links */}
          <View style={styles.footerContainer}>
            <TouchableOpacity
              onPress={onNavigateToForgotPassword}
              disabled={busy}
              activeOpacity={0.7}
              style={styles.forgotTouch}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <View style={styles.signUpGroup}>
              <Text style={styles.needAccountText}>Need an account?</Text>
              <TouchableOpacity onPress={onNavigateToSignUp} disabled={busy} activeOpacity={0.7}>
                <Text style={styles.signUpText}>SIGN UP</Text>
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
    paddingHorizontal: SCREEN_WIDTH * 0.06,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  /* Header Title */
  titleContainer: {
    alignItems: 'center',
    marginBottom: 6,
  },
  titleText: {
    color: '#fde68a',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(217, 119, 6, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  goldDivider: {
    width: 140,
    height: 1,
    backgroundColor: 'rgba(253, 230, 138, 0.35)',
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerDiamond: {
    width: 6,
    height: 6,
    backgroundColor: '#fde68a',
    transform: [{ rotate: '45deg' }],
  },
  subtitleText: {
    color: '#94a3b8',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  /* Form & Characters Container */
  formWrapper: {
    width: '100%',
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
  charactersImage: {
    width: CHARACTERS_WIDTH,
    height: CHARACTERS_HEIGHT,
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
  inputGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#070d17',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(217, 119, 6, 0.45)',
    height: 52,
    paddingHorizontal: 14,
  },
  inputBoxFocused: {
    borderColor: '#f59e0b',
    backgroundColor: '#091220',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  inputBoxError: {
    borderColor: '#ef4444',
  },
  fieldErrorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 4,
  },
  formErrorText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  iconContainer: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  eyeButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Buttons */
  loginButton: {
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    marginTop: 6,
    shadowColor: '#dc2626',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  loginButtonBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  loginButtonText: {
    color: '#fef08a',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  googleButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  googleButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  googleButtonText: {
    color: '#1e293b',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  orDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(253, 230, 138, 0.2)',
  },
  orText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginHorizontal: 12,
  },
  guestButton: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.25)',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  guestButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },

  /* Footer */
  footerContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginTop: 12,
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
    letterSpacing: 1.5,
  },
});
