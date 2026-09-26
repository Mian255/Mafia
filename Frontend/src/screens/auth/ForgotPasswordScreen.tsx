import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type ForgotPasswordStep = 'request' | 'otp' | 'new-password' | 'success';

interface ForgotPasswordScreenProps {
  onNavigateToLogin?: () => void;
  initialStep?: ForgotPasswordStep;
}

export default function ForgotPasswordScreen({
  onNavigateToLogin,
  initialStep = 'request',
}: ForgotPasswordScreenProps) {
  const [step, setStep] = useState<ForgotPasswordStep>(initialStep);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Input Refs for smooth focusing
  const emailInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // Focus tracking for golden highlight
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const triggerAnimation = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    triggerAnimation();
  }, [step]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // =========================================================================
  // STEP 1: Request Password Recovery Email / Code
  // =========================================================================
  const handleSendRecovery = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid registered email address.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const redirectUrl = makeRedirectUri({ scheme: 'mafia' });
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage(`Recovery dispatch sent to ${cleanEmail}`);
        setResendCooldown(60);
        setStep('otp');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to transmit recovery email.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // STEP 2: Verify OTP Code
  // =========================================================================
  const handleVerifyOtp = async () => {
    const cleanOtp = otpCode.trim();
    if (cleanOtp.length < 6) {
      setErrorMessage('Please enter the complete verification code.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanOtp,
        type: 'recovery',
      });

      if (error) {
        setErrorMessage(error.message);
      } else if (data.session || data.user) {
        setSuccessMessage('Code verified. Set your new secret passcode.');
        setStep('new-password');
      } else {
        setErrorMessage('Verification failed. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify recovery code.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // STEP 3: Set New Password
  // =========================================================================
  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Passcode must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passcodes do not match. Please verify.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setStep('success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update passcode.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Atmospheric Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#081220" />
              <Stop offset="40%" stopColor="#060c16" />
              <Stop offset="100%" stopColor="#04070d" />
            </LinearGradient>
            <LinearGradient id="ambientRed" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#991b1b" stopOpacity="0.25" />
              <Stop offset="50%" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambientRed)" />
        </Svg>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            {/* Step Indicators */}
            <View style={styles.stepIndicatorRow}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View
                style={[
                  styles.stepLine,
                  (step === 'otp' || step === 'new-password' || step === 'success') &&
                    styles.stepLineActive,
                ]}
              />
              <View
                style={[
                  styles.stepDot,
                  (step === 'otp' || step === 'new-password' || step === 'success') &&
                    styles.stepDotActive,
                ]}
              />
              <View
                style={[
                  styles.stepLine,
                  (step === 'new-password' || step === 'success') && styles.stepLineActive,
                ]}
              />
              <View
                style={[
                  styles.stepDot,
                  (step === 'new-password' || step === 'success') && styles.stepDotActive,
                ]}
              />
            </View>

            {/* Header Icon & Title */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>
                  {step === 'request' && '🔐'}
                  {step === 'otp' && '📬'}
                  {step === 'new-password' && '🛡️'}
                  {step === 'success' && '✅'}
                </Text>
              </View>

              <Text style={styles.title}>
                {step === 'request' && 'RECOVER ACCESS'}
                {step === 'otp' && 'ENTER CODE'}
                {step === 'new-password' && 'NEW PASSCODE'}
                {step === 'success' && 'ACCESS RESTORED'}
              </Text>

              <Text style={styles.subtitle}>
                {step === 'request' &&
                  'Enter your registered email to receive a secret recovery dispatch code.'}
                {step === 'otp' &&
                  `Enter the verification code sent to ${email || 'your email'}, or tap the link in your email.`}
                {step === 'new-password' &&
                  'Create a new secret passcode to secure your operative identity.'}
                {step === 'success' &&
                  'Your credentials have been securely updated. You can now log into the syndicate.'}
              </Text>
            </View>

            {/* Error & Info Banners */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage && step !== 'success' ? (
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>{successMessage}</Text>
              </View>
            ) : null}

            {/* ============================================================= */}
            {/* STEP 1: Email Form */}
            {/* ============================================================= */}
            {step === 'request' && (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>REGISTERED EMAIL</Text>
                  <Pressable
                    style={[
                      styles.inputBox,
                      focusedInput === 'email' && styles.inputBoxFocused,
                    ]}
                    onPress={() => emailInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={emailInputRef}
                      style={styles.input}
                      placeholder="operative@domain.com"
                      placeholderTextColor="#64748b"
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        if (errorMessage) setErrorMessage('');
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSendRecovery}
                      onFocus={() => setFocusedInput('email')}
                      onBlur={() => setFocusedInput(null)}
                      selectionColor="#fbbf24"
                      cursorColor="#fbbf24"
                    />
                  </Pressable>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleSendRecovery}
                  activeOpacity={0.85}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fde68a" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>SEND RECOVERY CODE</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={onNavigateToLogin}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backText}>← Back to Login</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ============================================================= */}
            {/* STEP 2: OTP Verification Form */}
            {/* ============================================================= */}
            {step === 'otp' && (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>VERIFICATION CODE</Text>
                  <Pressable
                    style={[
                      styles.inputBox,
                      focusedInput === 'otp' && styles.inputBoxFocused,
                    ]}
                    onPress={() => otpInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={otpInputRef}
                      style={[styles.input, styles.otpInput]}
                      placeholder="Enter code"
                      placeholderTextColor="#475569"
                      value={otpCode}
                      onChangeText={(text) => {
                        setOtpCode(text.replace(/[^0-9]/g, ''));
                        if (errorMessage) setErrorMessage('');
                      }}
                      keyboardType="number-pad"
                      maxLength={10}
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyOtp}
                      onFocus={() => setFocusedInput('otp')}
                      onBlur={() => setFocusedInput(null)}
                      selectionColor="#fbbf24"
                      cursorColor="#fbbf24"
                    />
                  </Pressable>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  activeOpacity={0.85}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fde68a" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>VERIFY CODE</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  <TouchableOpacity
                    onPress={handleSendRecovery}
                    disabled={resendCooldown > 0 || isLoading}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.resendText,
                        resendCooldown > 0 && styles.resendTextDisabled,
                      ]}
                    >
                      {resendCooldown > 0
                        ? `Resend code in ${resendCooldown}s`
                        : 'Resend recovery code'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep('request')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backText}>← Change Email</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ============================================================= */}
            {/* STEP 3: Set New Password Form */}
            {/* ============================================================= */}
            {step === 'new-password' && (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>NEW SECRET PASSCODE</Text>
                  <Pressable
                    style={[
                      styles.inputBox,
                      focusedInput === 'newPassword' && styles.inputBoxFocused,
                    ]}
                    onPress={() => newPasswordRef.current?.focus()}
                  >
                    <TextInput
                      ref={newPasswordRef}
                      style={styles.input}
                      placeholder="Minimum 6 characters"
                      placeholderTextColor="#64748b"
                      value={newPassword}
                      onChangeText={(text) => {
                        setNewPassword(text);
                        if (errorMessage) setErrorMessage('');
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                      onFocus={() => setFocusedInput('newPassword')}
                      onBlur={() => setFocusedInput(null)}
                      selectionColor="#fbbf24"
                      cursorColor="#fbbf24"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Text style={styles.eyeText}>{showPassword ? '👁️' : '🔒'}</Text>
                    </TouchableOpacity>
                  </Pressable>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>CONFIRM NEW PASSCODE</Text>
                  <Pressable
                    style={[
                      styles.inputBox,
                      focusedInput === 'confirmPassword' && styles.inputBoxFocused,
                    ]}
                    onPress={() => confirmPasswordRef.current?.focus()}
                  >
                    <TextInput
                      ref={confirmPasswordRef}
                      style={styles.input}
                      placeholder="Repeat new passcode"
                      placeholderTextColor="#64748b"
                      value={confirmPassword}
                      onChangeText={(text) => {
                        setConfirmPassword(text);
                        if (errorMessage) setErrorMessage('');
                      }}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={handleUpdatePassword}
                      onFocus={() => setFocusedInput('confirmPassword')}
                      onBlur={() => setFocusedInput(null)}
                      selectionColor="#fbbf24"
                      cursorColor="#fbbf24"
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeButton}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Text style={styles.eyeText}>{showConfirmPassword ? '👁️' : '🔒'}</Text>
                    </TouchableOpacity>
                  </Pressable>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleUpdatePassword}
                  activeOpacity={0.85}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fde68a" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>SAVE NEW PASSCODE</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ============================================================= */}
            {/* STEP 4: Success Screen */}
            {/* ============================================================= */}
            {step === 'success' && (
              <View style={styles.successContainer}>
                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    Your password has been changed successfully. You can now log into your account
                    with your new credentials.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onNavigateToLogin}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>RETURN TO LOGIN</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
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
    justifyContent: 'center',
    paddingHorizontal: Math.max(14, SCREEN_WIDTH * 0.05),
    paddingVertical: 24,
  },
  contentCard: {
    backgroundColor: 'rgba(11, 18, 32, 0.94)',
    borderRadius: 22,
    padding: SCREEN_WIDTH < 360 ? 16 : 24,
    borderWidth: 1.5,
    borderColor: 'rgba(253, 230, 138, 0.28)',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },

  /* Step Dots */
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepDotActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#fde68a',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  stepLine: {
    width: Math.min(28, SCREEN_WIDTH * 0.07),
    height: 2,
    backgroundColor: '#1e293b',
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: '#f59e0b',
  },

  /* Header */
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#070d17',
    borderWidth: 1.5,
    borderColor: 'rgba(253, 230, 138, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#f59e0b',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  iconEmoji: {
    fontSize: 24,
  },
  title: {
    color: '#fde68a',
    fontSize: SCREEN_WIDTH < 360 ? 20 : 23,
    fontWeight: '900',
    letterSpacing: SCREEN_WIDTH < 360 ? 2 : 2.5,
    marginBottom: 6,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: SCREEN_WIDTH < 360 ? 11.5 : 12.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 6,
  },

  /* Banners */
  errorBanner: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  infoBanner: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  infoText: {
    color: '#7dd3fc',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* Inputs & Form */
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
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
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#ffffff',
    fontSize: SCREEN_WIDTH < 360 ? 14 : 15,
    fontWeight: '600',
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  otpInput: {
    fontSize: SCREEN_WIDTH < 360 ? 18 : 20,
    letterSpacing: SCREEN_WIDTH < 360 ? 3 : 4,
    textAlign: 'center',
    fontWeight: '800',
  },
  eyeButton: {
    padding: 6,
  },
  eyeText: {
    fontSize: 16,
  },

  /* Buttons */
  primaryButton: {
    backgroundColor: '#991b1b',
    borderRadius: 14,
    height: Math.max(48, Math.min(52, SCREEN_WIDTH * 0.13)),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    marginTop: 6,
    shadowColor: '#dc2626',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fef08a',
    fontSize: SCREEN_WIDTH < 360 ? 13.5 : 14.5,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 12,
  },
  resendText: {
    color: '#fde68a',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resendTextDisabled: {
    color: '#64748b',
  },
  backButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 6,
  },
  backText: {
    color: '#94a3b8',
    fontSize: 12.5,
    fontWeight: '700',
  },

  /* Success Container */
  successContainer: {
    width: '100%',
  },
  tipBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: 14,
    marginBottom: 18,
  },
  tipText: {
    color: '#a7f3d0',
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '600',
  },
});
