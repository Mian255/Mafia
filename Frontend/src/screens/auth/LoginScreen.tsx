import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { signInWithGoogle } from '../../lib/auth';
import { getFriendlyAuthError, isBrandNewAccount } from '../../lib/authHelpers';
import { AuthTextInput } from '../../components/auth/AuthTextInput';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { useStableCallback } from '../../hooks/useStableCallback';

const mafiaVsDetective = require('../../../assets/characters_transparent.png');

const CHARACTERS_ASPECT_RATIO = 1042 / 499;
const MAX_FONT_SCALE = 1.3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface LoginLayout {
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
  titleFontSize: number;
  titleLetterSpacing: number;
  titleGap: number;
  dividerWidth: number;
  subtitleFontSize: number;
  subtitleLetterSpacing: number;
  charactersWidth: number;
  charactersHeight: number;
}

function useLoginLayout(): LoginLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const scale = clamp(width / 390, 0.82, 1.35);
    const statusBarInset =
      Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : height / width > 2 ? 47 : 20;
    const topGap = clamp(height * 0.035, 14, 40);
    const titleFontSize = Math.round(clamp(38 * scale, 30, 52));
    const charactersWidth = Math.round(
      Math.min(
        clamp(width * 0.74, 220, 360),
        clamp(height * 0.22, 120, 240) * CHARACTERS_ASPECT_RATIO
      )
    );
    return {
      paddingTop: statusBarInset + topGap,
      paddingBottom: clamp(height * 0.025, 12, 32),
      paddingHorizontal: clamp(width * 0.06, 16, 40),
      titleFontSize,
      titleLetterSpacing: Math.round(titleFontSize * 0.16),
      titleGap: clamp(height * 0.02, 8, 24),
      dividerWidth: clamp(140 * scale, 110, 200),
      subtitleFontSize: clamp(10.5 * scale, 9.5, 14),
      subtitleLetterSpacing: clamp(2.5 * scale, 1.5, 3.5),
      charactersWidth,
      charactersHeight: Math.round(charactersWidth / CHARACTERS_ASPECT_RATIO),
    };
  }, [width, height]);
}

const NoirBackground = memo(function NoirBackground() {
  return (
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
  );
});

const TitleBlock = memo(function TitleBlock({ layout }: { layout: LoginLayout }) {
  return (
    <View style={[styles.titleContainer, { marginBottom: layout.titleGap }]}>
      <Text
        style={[
          styles.titleText,
          { fontSize: layout.titleFontSize, letterSpacing: layout.titleLetterSpacing },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.15}
        accessibilityRole="header"
      >
        MAFIA
      </Text>
      <View style={[styles.goldDivider, { width: layout.dividerWidth }]}>
        <View style={styles.dividerDiamond} />
      </View>
      <Text
        style={[
          styles.subtitleText,
          { fontSize: layout.subtitleFontSize, letterSpacing: layout.subtitleLetterSpacing },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={1.2}
      >
        TRUST NO ONE • SUSPECT EVERYONE
      </Text>
    </View>
  );
});

const CharactersStage = memo(function CharactersStage({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return (
    <View style={styles.charactersStage} pointerEvents="none">
      <Image source={mafiaVsDetective} style={{ width, height }} resizeMode="contain" />
    </View>
  );
});

const LoginButtonBackground = memo(function LoginButtonBackground() {
  return (
    <View style={styles.loginButtonBg} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="btnGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#dc2626" />
            <Stop offset="50%" stopColor="#991b1b" />
            <Stop offset="100%" stopColor="#580f0f" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx="14" ry="14" fill="url(#btnGrad)" />
      </Svg>
    </View>
  );
});

const renderEmailIcon = (focused: boolean) => (
  <Svg width="20" height="20" viewBox="0 0 24 24">
    <Path
      d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
      fill={focused ? '#fbbf24' : '#fde68a'}
    />
  </Svg>
);

const renderLockIcon = (focused: boolean) => (
  <Svg width="20" height="20" viewBox="0 0 24 24">
    <Path
      d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
      fill={focused ? '#fbbf24' : '#fde68a'}
    />
  </Svg>
);

const EyeToggle = memo(function EyeToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={styles.eyeButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
    >
      <Svg width="20" height="20" viewBox="0 0 24 24">
        {visible ? (
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
  );
});

interface LoginScreenProps {
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
  onLoginSuccess?: (user: User) => Promise<void> | void;
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [noAccountFound, setNoAccountFound] = useState(false);

  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const requestInFlight = useRef(false);

  const busy = loading || googleLoading;

  const layout = useLoginLayout();
  const scrollContentStyle = useMemo(
    () => [
      styles.scrollContent,
      {
        paddingTop: layout.paddingTop,
        paddingBottom: layout.paddingBottom,
        paddingHorizontal: layout.paddingHorizontal,
      },
    ],
    [layout]
  );

  const runExclusive = async (setBusy: (value: boolean) => void, task: () => Promise<void>) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setFormError('');
    setNoAccountFound(false);
    try {
      await task();
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
    setFormError((prev) => (prev ? '' : prev));
    setNoAccountFound(false);
  }, []);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    setFieldErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev));
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  const focusPassword = useCallback(() => passwordInputRef.current?.focus(), []);
  const togglePassword = useCallback(() => setShowPassword((prev) => !prev), []);
  const eyeToggle = useMemo(
    () => <EyeToggle visible={showPassword} onToggle={togglePassword} />,
    [showPassword, togglePassword]
  );

  const handleGoogleLogin = useStableCallback(() =>
    runExclusive(setGoogleLoading, async () => {
      try {
        const session = await signInWithGoogle();
        if (!session?.user) return;

        if (isBrandNewAccount(session.user)) {
          await supabase.auth.signOut();
          setNoAccountFound(true);
          return;
        }

        await onLoginSuccess?.(session.user);
      } catch (err: unknown) {
        setFormError(getFriendlyAuthError(err, "Google sign-in didn't work. Please try again."));
      }
    })
  );

  const handleLogin = useStableCallback(() => {
    const trimmedInput = email.trim();
    const errors: FieldErrors = {};

    if (!trimmedInput) {
      errors.email = 'Please enter your username or email.';
    }
    if (!password) {
      errors.password = 'Please enter your password.';
    }
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setFormError('');
      return;
    }

    return runExclusive(setLoading, async () => {
      try {
        let loginEmail = trimmedInput;

        // If user typed a username without @, find their email from profiles
        if (!trimmedInput.includes('@')) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, username')
            .ilike('username', trimmedInput)
            .maybeSingle();

          const typedProfile = profile as { id: string; email?: string | null; username?: string } | null;
          if (typedProfile?.email) {
            loginEmail = typedProfile.email;
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

        if (error || !data.session) {
          setFormError(getFriendlyAuthError(error, "We couldn't log you in. Please try again."));
          return;
        }

        await onLoginSuccess?.(data.session.user);
      } catch (err: unknown) {
        setFormError(getFriendlyAuthError(err));
      }
    });
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <NoirBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          <TitleBlock layout={layout} />

          {/* Form & Characters Combined Unit */}
          <View style={styles.formWrapper}>
            <CharactersStage width={layout.charactersWidth} height={layout.charactersHeight} />

            <View style={styles.formCard}>
              <AuthTextInput
                ref={emailInputRef}
                label="USERNAME / EMAIL"
                variant="gold"
                error={fieldErrors.email}
                renderIcon={renderEmailIcon}
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

              {/* No account with Google alert */}
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

              {/* Server / auth error */}
              {formError ? (
                <Text
                  style={styles.formErrorText}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  accessibilityLiveRegion="polite"
                >
                  {formError}
                </Text>
              ) : null}

              {/* Primary Login Button */}
              <TouchableOpacity
                style={[styles.loginButton, busy && !loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy: loading }}
                activeOpacity={0.85}
              >
                <LoginButtonBackground />
                {loading ? (
                  <ActivityIndicator color="#fde68a" size="small" />
                ) : (
                  <Text style={styles.loginButtonText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    LOGIN
                  </Text>
                )}
              </TouchableOpacity>

              <GoogleSignInButton
                onPress={handleGoogleLogin}
                loading={googleLoading}
                disabled={busy}
              />
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
              <Text style={styles.forgotText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Forgot Password?
              </Text>
            </TouchableOpacity>

            <View style={styles.signUpGroup}>
              <Text style={styles.needAccountText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Need an account?
              </Text>
              <TouchableOpacity onPress={onNavigateToSignUp} disabled={busy} activeOpacity={0.7}>
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

  /* Header Title */
  titleContainer: {
    width: '100%',
    alignItems: 'center',
  },
  titleText: {
    color: '#fde68a',
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(217, 119, 6, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  goldDivider: {
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
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  /* Form & Characters Container */
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
  eyeButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formErrorText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
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
  buttonDisabled: {
    opacity: 0.6,
  },

  /* Buttons */
  loginButton: {
    height: 50,
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
    fontSize: 16.5,
    fontWeight: '900',
    letterSpacing: 2.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  /* Footer */
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
});
