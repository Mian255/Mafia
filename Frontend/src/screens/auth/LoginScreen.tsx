import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

const mafiaVsDetective = require('../../../assets/characters_transparent.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHARACTERS_WIDTH = Math.min(SCREEN_WIDTH * 0.74, 280);
const CHARACTERS_HEIGHT = CHARACTERS_WIDTH / (1042 / 499);

interface LoginScreenProps {
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
  onLoginSuccess?: (usernameOrEmail: string) => void;
}

export default function LoginScreen({
  onNavigateToSignUp,
  onNavigateToForgotPassword,
  onLoginSuccess,
}: LoginScreenProps) {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle();
      if (session?.user && onLoginSuccess) {
        onLoginSuccess(
          session.user.user_metadata?.full_name ||
            session.user.email?.split('@')[0] ||
            'Player'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign in failed.';
      Alert.alert('Google Sign-In', message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    const identifier = emailOrUsername.trim();
    if (!identifier) {
      Alert.alert('Required', 'Please enter your username or email.');
      return;
    }
    if (!password) {
      Alert.alert('Required', 'Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      let loginEmail = identifier;
      let matchedUsername = identifier;

      if (!identifier.includes('@')) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, username')
          .ilike('username', identifier)
          .maybeSingle();

        const typedProfile = profile as { id: string; email?: string | null; username?: string } | null;
        if (typedProfile?.email) {
          loginEmail = typedProfile.email;
          if (typedProfile.username) matchedUsername = typedProfile.username;
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) {
        Alert.alert('Login Failed', error.message);
      } else if (data?.user) {
        if (data.user.email) {
          Promise.resolve(
            supabase
              .from('profiles')
              .update({ email: data.user.email } as never)
              .eq('id', data.user.id)
          ).catch(() => {});
        }
        if (onLoginSuccess) {
          onLoginSuccess(matchedUsername);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      const titles = [
        'Shadow',
        'Vito',
        'Cipher',
        'Falcon',
        'Specter',
        'Raven',
        'Bullet',
        'Enforcer',
        'Outlaw',
        'Ghost',
        'Phantom',
        'Blaze',
      ];
      const randomTitle = titles[Math.floor(Math.random() * titles.length)];
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      const guestAlias = `Guest_${randomTitle}_${randomCode}`;

      const { data, error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            username: guestAlias,
            is_guest: true,
          },
        },
      });

      if (error) {
        if (onLoginSuccess) {
          onLoginSuccess(guestAlias);
          return;
        }
        Alert.alert('Guest Login', error.message);
      } else if (data?.user) {
        const uniqueAlias =
          data.user.user_metadata?.username ||
          `Guest_${randomTitle}_${data.user.id.substring(0, 4).toUpperCase()}`;
        if (onLoginSuccess) {
          onLoginSuccess(uniqueAlias);
        }
      }
    } catch {
      const titles = ['Shadow', 'Vito', 'Cipher', 'Ghost', 'Specter'];
      const fallbackTitle = titles[Math.floor(Math.random() * titles.length)];
      const fallbackAlias = `Guest_${fallbackTitle}_${Math.floor(1000 + Math.random() * 9000)}`;
      if (onLoginSuccess) {
        onLoginSuccess(fallbackAlias);
      }
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Atmospheric Dual-Tone Dark Background */}
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            <View style={styles.charactersStage} pointerEvents="none">
              <Image source={mafiaVsDetective} style={styles.charactersImage} resizeMode="contain" />
            </View>

            {/* Login Box Container */}
            <View style={styles.formCard}>
              {/* Username / Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>USERNAME / EMAIL</Text>
                <Pressable
                  style={[styles.inputBox, focusedField === 'email' && styles.inputBoxFocused]}
                  onPress={() => emailInputRef.current?.focus()}
                >
                  <View style={styles.iconContainer} pointerEvents="none">
                    <Svg width="20" height="20" viewBox="0 0 24 24">
                      <Path
                        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                        fill={focusedField === 'email' ? '#fbbf24' : '#fde68a'}
                      />
                    </Svg>
                  </View>
                  <TextInput
                    ref={emailInputRef}
                    style={styles.textInput}
                    value={emailOrUsername}
                    onChangeText={setEmailOrUsername}
                    placeholder="Enter username or email"
                    placeholderTextColor="#64748b"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    selectionColor="#fbbf24"
                    cursorColor="#fbbf24"
                  />
                </Pressable>
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <Pressable
                  style={[styles.inputBox, focusedField === 'password' && styles.inputBoxFocused]}
                  onPress={() => passwordInputRef.current?.focus()}
                >
                  <View style={styles.iconContainer} pointerEvents="none">
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
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="#64748b"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    selectionColor="#fbbf24"
                    cursorColor="#fbbf24"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    activeOpacity={0.7}
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
                </Pressable>
              </View>

              {/* Primary Login Button */}
              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
                disabled={loading || guestLoading || googleLoading}
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
                style={styles.googleButton}
                onPress={handleGoogleLogin}
                disabled={loading || guestLoading || googleLoading}
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
                style={styles.guestButton}
                onPress={handleGuestLogin}
                disabled={loading || guestLoading || googleLoading}
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
              activeOpacity={0.7}
              style={styles.forgotTouch}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <View style={styles.signUpGroup}>
              <Text style={styles.needAccountText}>Need an account?</Text>
              <TouchableOpacity onPress={onNavigateToSignUp} activeOpacity={0.7}>
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
    paddingHorizontal: Math.max(14, SCREEN_WIDTH * 0.05),
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  /* Header Title */
  titleContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  titleText: {
    color: '#fde68a',
    fontSize: Math.min(SCREEN_WIDTH * 0.09, 36),
    fontWeight: '900',
    letterSpacing: Math.min(SCREEN_WIDTH * 0.015, 6),
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(217, 119, 6, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  goldDivider: {
    width: Math.min(140, SCREEN_WIDTH * 0.35),
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
    fontSize: SCREEN_WIDTH < 360 ? 9.5 : 10.5,
    fontWeight: '700',
    letterSpacing: SCREEN_WIDTH < 360 ? 1.8 : 2.5,
    textTransform: 'uppercase',
  },

  /* Form & Characters Container */
  formWrapper: {
    width: '100%',
    maxWidth: 420,
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
    paddingHorizontal: SCREEN_WIDTH < 360 ? 14 : 20,
    paddingTop: SCREEN_WIDTH < 360 ? 16 : 22,
    paddingBottom: SCREEN_WIDTH < 360 ? 16 : 20,
    borderWidth: 1.5,
    borderColor: 'rgba(253, 230, 138, 0.28)',
    shadowColor: '#000000',
    shadowOpacity: 0.85,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  inputGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#cbd5e1',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#070d17',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(217, 119, 6, 0.45)',
    height: Math.max(48, Math.min(52, SCREEN_WIDTH * 0.13)),
    paddingHorizontal: 12,
  },
  inputBoxFocused: {
    borderColor: '#f59e0b',
    backgroundColor: '#091220',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: '100%',
    color: '#ffffff',
    fontSize: SCREEN_WIDTH < 360 ? 14 : 15,
    fontWeight: '600',
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  eyeButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Buttons */
  loginButton: {
    height: Math.max(48, Math.min(52, SCREEN_WIDTH * 0.13)),
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
    fontSize: SCREEN_WIDTH < 360 ? 15 : 16.5,
    fontWeight: '900',
    letterSpacing: 2.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  googleButton: {
    height: Math.max(44, Math.min(48, SCREEN_WIDTH * 0.12)),
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginTop: 8,
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
    fontSize: SCREEN_WIDTH < 360 ? 11.5 : 12.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  orDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(253, 230, 138, 0.2)',
  },
  orText: {
    color: '#64748b',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 2,
    marginHorizontal: 10,
  },
  guestButton: {
    height: Math.max(42, Math.min(44, SCREEN_WIDTH * 0.11)),
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.25)',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  guestButtonText: {
    color: '#cbd5e1',
    fontSize: SCREEN_WIDTH < 360 ? 11 : 12,
    fontWeight: '700',
    letterSpacing: 1.8,
  },

  /* Footer */
  footerContainer: {
    width: '100%',
    maxWidth: 420,
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
    fontSize: SCREEN_WIDTH < 360 ? 11.5 : 12.5,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  signUpGroup: {
    alignItems: 'flex-end',
  },
  needAccountText: {
    color: '#94a3b8',
    fontSize: SCREEN_WIDTH < 360 ? 10 : 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  signUpText: {
    color: '#fde68a',
    fontSize: SCREEN_WIDTH < 360 ? 13.5 : 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});
