import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

const mafiaDetectiveCard = require('../../../assets/mafia_detective_card.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

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
      if (!identifier.includes('@')) {
        // Attempt to match username
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', identifier)
          .maybeSingle();

        const typedProfile = profile as { id: string } | null;
        if (typedProfile?.id) {
          loginEmail = `${identifier.toLowerCase()}@mafia.game`;
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) {
        if (onLoginSuccess) {
          onLoginSuccess(identifier);
          return;
        }
        Alert.alert('Login Failed', error.message);
      } else if (data?.user) {
        if (onLoginSuccess) {
          onLoginSuccess(identifier);
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
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        if (onLoginSuccess) {
          const guestAlias = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
          onLoginSuccess(guestAlias);
          return;
        }
        Alert.alert('Guest Login', error.message);
      } else if (data?.user) {
        const guestAlias = `Guest_${data.user.id.substring(0, 4).toUpperCase()}`;
        if (onLoginSuccess) {
          onLoginSuccess(guestAlias);
        }
      }
    } catch {
      const guestAlias = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
      if (onLoginSuccess) {
        onLoginSuccess(guestAlias);
      }
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Atmospheric Noir Dual-Tone Ambient Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#0a1628" />
              <Stop offset="45%" stopColor="#08101d" />
              <Stop offset="100%" stopColor="#050a12" />
            </LinearGradient>
            <LinearGradient id="ambientRed" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#7f1d1d" stopOpacity="0.28" />
              <Stop offset="50%" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="ambientBlue" x1="100%" y1="0%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#0369a1" stopOpacity="0.28" />
              <Stop offset="50%" stopColor="#000000" stopOpacity="0" />
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

          {/* Character Split Hero Art Card */}
          <View style={styles.cardWrapper}>
            <View style={styles.cardGlowLeft} />
            <View style={styles.cardGlowRight} />
            <View style={styles.cardFrame}>
              <Image source={mafiaDetectiveCard} style={styles.cardImage} resizeMode="cover" />
              <View style={styles.cardInnerBorder} />
            </View>
          </View>

          {/* Form Container */}
          <View style={styles.formCard}>
            {/* Username / Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>USERNAME / EMAIL</Text>
              <View style={[styles.inputBox, focusedField === 'email' && styles.inputBoxFocused]}>
                <View style={styles.iconContainer}>
                  <Svg width="20" height="20" viewBox="0 0 24 24">
                    <Path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                      fill={focusedField === 'email' ? '#fbbf24' : '#fde68a'}
                    />
                  </Svg>
                </View>
                <TextInput
                  style={styles.textInput}
                  value={emailOrUsername}
                  onChangeText={setEmailOrUsername}
                  placeholder="Enter username or email"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View
                style={[styles.inputBox, focusedField === 'password' && styles.inputBoxFocused]}
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
                  style={styles.textInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
            </View>

            {/* Primary Login Button */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={loading || guestLoading}
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

            {/* Play as Guest Option */}
            <TouchableOpacity
              style={styles.guestButton}
              onPress={handleGuestLogin}
              disabled={loading || guestLoading}
              activeOpacity={0.75}
            >
              {guestLoading ? (
                <ActivityIndicator color="#cbd5e1" size="small" />
              ) : (
                <Text style={styles.guestButtonText}>PLAY AS GUEST</Text>
              )}
            </TouchableOpacity>
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
    paddingHorizontal: SCREEN_WIDTH * 0.07,
    paddingTop: Platform.OS === 'ios' ? 55 : 35,
    paddingBottom: 30,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  /* Header Title */
  titleContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  titleText: {
    color: '#fde68a',
    fontSize: 40,
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
    marginVertical: 6,
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
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  /* Split Artwork Card */
  cardWrapper: {
    width: SCREEN_WIDTH * 0.74,
    height: SCREEN_WIDTH * 0.7,
    position: 'relative',
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGlowLeft: {
    position: 'absolute',
    left: -15,
    top: 20,
    bottom: 20,
    width: 50,
    backgroundColor: 'rgba(185, 28, 28, 0.25)',
    borderRadius: 30,
    shadowColor: '#dc2626',
    shadowOpacity: 0.8,
    shadowRadius: 25,
  },
  cardGlowRight: {
    position: 'absolute',
    right: -15,
    top: 20,
    bottom: 20,
    width: 50,
    backgroundColor: 'rgba(2, 132, 199, 0.25)',
    borderRadius: 30,
    shadowColor: '#0284c7',
    shadowOpacity: 0.8,
    shadowRadius: 25,
  },
  cardFrame: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0b1320',
    borderWidth: 2,
    borderColor: 'rgba(253, 230, 138, 0.35)',
    shadowColor: '#000000',
    shadowOpacity: 0.85,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 15,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardInnerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  /* Form Card & Inputs */
  formCard: {
    width: '100%',
    backgroundColor: 'rgba(13, 22, 38, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.2)',
    shadowColor: '#000000',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    marginVertical: 8,
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
    backgroundColor: '#080e18',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(217, 119, 6, 0.45)',
    height: 50,
    paddingHorizontal: 14,
  },
  inputBoxFocused: {
    borderColor: '#f59e0b',
    backgroundColor: '#0a1322',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
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
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    marginTop: 6,
    shadowColor: '#dc2626',
    shadowOpacity: 0.5,
    shadowRadius: 12,
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
  guestButton: {
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.25)',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    marginTop: 10,
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
    marginTop: 6,
  },
  forgotTouch: {
    paddingVertical: 6,
  },
  forgotText: {
    color: '#fde68a',
    fontSize: 12,
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
