import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { getFriendlyAuthError, validateEmail } from '../../lib/authHelpers';

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

  // Input Refs
  const emailInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // Focus tracking
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Synchronous guard
  const requestInFlight = useRef(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const triggerAnimation = useCallback(() => {
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
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    triggerAnimation();
  }, [step, triggerAnimation]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // STEP 1: Request Recovery Email / Code
  const handleSendRecovery = async () => {
    if (requestInFlight.current) return;
    const cleanEmail = email.trim();
    const emailErr = validateEmail(cleanEmail);
    if (emailErr) {
      setErrorMessage(emailErr);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);
    requestInFlight.current = true;

    try {
      const redirectUrl = makeRedirectUri({ scheme: 'mafia' });
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setErrorMessage(getFriendlyAuthError(error, 'Failed to send recovery email.'));
      } else {
        setSuccessMessage(`Recovery dispatch sent to ${cleanEmail}`);
        setResendCooldown(60);
        setStep('otp');
      }
    } catch (err: unknown) {
      setErrorMessage(getFriendlyAuthError(err, 'Failed to transmit recovery email.'));
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  };

  // STEP 2: Verify OTP Code
  const handleVerifyOtp = async () => {
    if (requestInFlight.current) return;
    const cleanOtp = otpCode.trim();
    if (cleanOtp.length < 6) {
      setErrorMessage('Please enter the complete verification code.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);
    requestInFlight.current = true;

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanOtp,
        type: 'recovery',
      });

      if (error) {
        setErrorMessage(getFriendlyAuthError(error, 'Invalid verification code.'));
      } else if (data.session || data.user) {
        setSuccessMessage('Code verified. Set your new secret passcode.');
        setStep('new-password');
      } else {
        setErrorMessage('Verification failed. Please try again.');
      }
    } catch (err: unknown) {
      setErrorMessage(getFriendlyAuthError(err, 'Failed to verify recovery code.'));
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  };

  // STEP 3: Set New Password
  const handleUpdatePassword = async () => {
    if (requestInFlight.current) return;
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
    requestInFlight.current = true;

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(getFriendlyAuthError(error, 'Failed to update passcode.'));
      } else {
        setStep('success');
      }
    } catch (err: unknown) {
      setErrorMessage(getFriendlyAuthError(err, 'Failed to update passcode.'));
    } finally {
      requestInFlight.current = false;
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
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {successMessage && step !== 'success' ? (
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>{successMessage}</Text>
              </View>
            ) : null}

            {/* STEP 1: EMAIL INPUT */}
            {step === 'request' && (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Registered Email</Text>
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
                      placeholderTextColor="#475569"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        setErrorMessage('');
                      }}
                      onFocus={() => setFocusedInput('email')}
                      onBlur={() => setFocusedInput(null)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      returnKeyType="send"
                      onSubmitEditing={handleSendRecovery}
                      editable={!isLoading}
                    />
                  </Pressable>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleSendRecovery}
                  activeOpacity={0.85}
                  disabled={isLoading}
                >
                  <View style={styles.buttonContent}>
                    {isLoading ? (
                      <ActivityIndicator color="#fef08a" size="small" style={styles.buttonSpinner} />
                    ) : null}
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'TRANSMITTING...' : 'SEND RECOVERY CODE'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={onNavigateToLogin}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backText}>← Back to Login</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 2: OTP INPUT */}
            {step === 'otp' && (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Verification Code (6-10 Digits)</Text>
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
                      placeholder="123456789"
                      placeholderTextColor="#334155"
                      value={otpCode}
                      onChangeText={(t) => {
                        setOtpCode(t);
                        setErrorMessage('');
                      }}
                      onFocus={() => setFocusedInput('otp')}
                      onBlur={() => setFocusedInput(null)}
                      keyboardType="number-pad"
                      maxLength={12}
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyOtp}
                      editable={!isLoading}
                    />
                  </Pressable>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  activeOpacity={0.85}
                  disabled={isLoading}
                >
                  <View style={styles.buttonContent}>
                    {isLoading ? (
                      <ActivityIndicator color="#fef08a" size="small" style={styles.buttonSpinner} />
                    ) : null}
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'VERIFYING...' : 'CONFIRM CODE'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendRow}
                  onPress={() => {
                    if (resendCooldown === 0) {
                      handleSendRecovery();
                    }
                  }}
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
                      : 'Resend Verification Code'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep('request')}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backText}>← Change Email Address</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 3: NEW PASSWORD */}
            {step === 'new-password' && (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New Passcode</Text>
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
                      placeholderTextColor="#475569"
                      value={newPassword}
                      onChangeText={(t) => {
                        setNewPassword(t);
                        setErrorMessage('');
                      }}
                      onFocus={() => setFocusedInput('newPassword')}
                      onBlur={() => setFocusedInput(null)}
                      secureTextEntry={!showPassword}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                      editable={!isLoading}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword((prev) => !prev)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.eyeText}>{showPassword ? '👁️' : '🔒'}</Text>
                    </TouchableOpacity>
                  </Pressable>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm Passcode</Text>
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
                      placeholder="Re-enter passcode"
                      placeholderTextColor="#475569"
                      value={confirmPassword}
                      onChangeText={(t) => {
                        setConfirmPassword(t);
                        setErrorMessage('');
                      }}
                      onFocus={() => setFocusedInput('confirmPassword')}
                      onBlur={() => setFocusedInput(null)}
                      secureTextEntry={!showConfirmPassword}
                      returnKeyType="done"
                      onSubmitEditing={handleUpdatePassword}
                      editable={!isLoading}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowConfirmPassword((prev) => !prev)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                  <View style={styles.buttonContent}>
                    {isLoading ? (
                      <ActivityIndicator color="#fef08a" size="small" style={styles.buttonSpinner} />
                    ) : null}
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'UPDATING...' : 'SECURE NEW PASSCODE'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={onNavigateToLogin}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 4: SUCCESS */}
            {step === 'success' && (
              <View style={styles.successContainer}>
                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    Your operative passcode has been changed. You can now access syndicate channels
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
    backgroundColor: 'rgba(11, 20, 38, 0.92)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(217, 119, 6, 0.35)',
    paddingHorizontal: Math.max(16, SCREEN_WIDTH * 0.05),
    paddingVertical: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    width: '100%',
  },
  stepDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: 'rgba(100, 116, 139, 0.4)',
    borderWidth: 1,
    borderColor: '#475569',
  },
  stepDotActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#fde68a',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 4,
  },
  stepLine: {
    width: 28,
    height: 2,
    backgroundColor: 'rgba(100, 116, 139, 0.3)',
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: '#f59e0b',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(153, 27, 27, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(217, 119, 6, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  iconEmoji: {
    fontSize: 24,
  },
  title: {
    fontSize: SCREEN_WIDTH < 360 ? 18 : 20,
    fontWeight: '900',
    color: '#fef08a',
    letterSpacing: 2.5,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: SCREEN_WIDTH < 360 ? 12 : 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  errorBanner: {
    backgroundColor: 'rgba(153, 27, 27, 0.3)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
    width: '100%',
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
    width: '100%',
  },
  infoText: {
    color: '#7dd3fc',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
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
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSpinner: {
    marginRight: 8,
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
