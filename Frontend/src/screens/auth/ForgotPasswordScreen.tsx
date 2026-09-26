import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import {
  MIN_PASSWORD_LENGTH,
  getFriendlyAuthError,
  validateEmail,
  validateNewPassword,
} from '../../lib/authHelpers';
import { rateLimiter } from '../../lib/rateLimit';
import {
  AuthCard,
  AuthErrorBanner,
  AuthHeader,
  AuthPrimaryButton,
  AuthTextInput,
  EyeToggle,
  NoirBackground,
  renderEmailIcon,
  renderLockCheckIcon,
  renderLockIcon,
  useAuthLayout,
} from '../../components/auth';
import { useStableCallback } from '../../hooks/useStableCallback';

export type ForgotPasswordStep = 'request' | 'otp' | 'new-password' | 'success';

interface ForgotPasswordScreenProps {
  onNavigateToLogin?: () => void;
  initialStep?: ForgotPasswordStep;
}

const RESEND_COOLDOWN_SECONDS = 45;
const MAX_FONT_SCALE = 1.3;

const StepIndicator = memo(function StepIndicator({
  step,
}: {
  step: ForgotPasswordStep;
}) {
  const steps: ForgotPasswordStep[] = ['request', 'otp', 'new-password'];
  const currentIndex = steps.indexOf(step);

  return (
    <View style={styles.stepIndicatorRow}>
      {steps.map((s, idx) => {
        const isActive = step === 'success' || (currentIndex !== -1 && idx <= currentIndex);
        return (
          <React.Fragment key={s}>
            <View style={[styles.stepDot, isActive && styles.stepDotActive]} />
            {idx < steps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  currentIndex !== -1 && idx < currentIndex && styles.stepLineActive,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
});

export default function ForgotPasswordScreen({
  onNavigateToLogin,
  initialStep = 'request',
}: ForgotPasswordScreenProps) {
  const layout = useAuthLayout(false);

  const [step, setStep] = useState<ForgotPasswordStep>(initialStep);
  const [email, setEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldError, setFieldError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpInputRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const clearErrors = useCallback(() => {
    setFieldError('');
    setErrorMessage('');
    setInfoMessage('');
  }, []);

  const handleSendResetEmail = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const trimmed = email.trim().toLowerCase();

    const limitCheck = rateLimiter.checkLimit('forgotPassword', trimmed || 'anonymous');
    if (!limitCheck.allowed) {
      setErrorMessage(limitCheck.message || 'Too many attempts. Please wait a moment.');
      return;
    }

    const err = validateEmail(trimmed);
    if (err) {
      setFieldError(err);
      return;
    }

    requestInFlight.current = true;
    setIsLoading(true);
    clearErrors();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: 'mafia://auth/callback?type=recovery',
      });

      if (error) {
        rateLimiter.recordAttempt('forgotPassword', trimmed);
        setErrorMessage(
          getFriendlyAuthError(error, "We couldn't send the recovery email. Please try again.")
        );
      } else {
        rateLimiter.reset('forgotPassword', trimmed);
        setInfoMessage('A 6-digit passcode has been sent to your email.');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setStep('otp');
      }
    } catch {
      setErrorMessage('Network connection issue. Check your connection.');
    } finally {
      setIsLoading(false);
      requestInFlight.current = false;
    }
  });

  const handleVerifyOtp = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const token = otpToken.trim();
    if (!token || token.length < 6) {
      setFieldError('Enter the full 6-digit passcode.');
      return;
    }

    requestInFlight.current = true;
    setIsLoading(true);
    clearErrors();

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: 'recovery',
      });

      if (error) {
        setErrorMessage(
          getFriendlyAuthError(error, 'Invalid or expired code. Request a new one.')
        );
      } else {
        setStep('new-password');
      }
    } catch {
      setErrorMessage('Network error during verification. Try again.');
    } finally {
      setIsLoading(false);
      requestInFlight.current = false;
    }
  });

  const handleUpdatePassword = useStableCallback(async () => {
    if (requestInFlight.current) return;

    const err = validateNewPassword(newPassword);
    if (err) {
      setFieldError(err);
      return;
    }

    if (newPassword !== confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }

    requestInFlight.current = true;
    setIsLoading(true);
    clearErrors();

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(
          getFriendlyAuthError(error, "Couldn't update password. Please try again.")
        );
      } else {
        setStep('success');
      }
    } catch {
      setErrorMessage('Network connection issue. Please try again.');
    } finally {
      setIsLoading(false);
      requestInFlight.current = false;
    }
  });

  const newPassEyeToggle = useMemo(
    () => (
      <EyeToggle
        visible={showNewPassword}
        onToggle={() => setShowNewPassword((prev) => !prev)}
      />
    ),
    [showNewPassword]
  );

  const confirmPassEyeToggle = useMemo(
    () => (
      <EyeToggle
        visible={showConfirmPassword}
        onToggle={() => setShowConfirmPassword((prev) => !prev)}
      />
    ),
    [showConfirmPassword]
  );

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
          <AuthHeader layout={layout} subtitle="ACCOUNT RECOVERY" />

          <View style={styles.formWrapper}>
            <AuthCard>
              <StepIndicator step={step} />

              <AuthErrorBanner message={errorMessage} />

              {infoMessage ? (
                <View style={styles.infoBanner}>
                  <Text style={styles.infoText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {infoMessage}
                  </Text>
                </View>
              ) : null}

              {/* STEP 1: REQUEST */}
              {step === 'request' && (
                <>
                  <Text style={styles.stepInstructions} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Enter your registered email address to receive a password reset code.
                  </Text>

                  <AuthTextInput
                    label="EMAIL ADDRESS"
                    variant="gold"
                    error={fieldError}
                    renderIcon={renderEmailIcon}
                    placeholder="agent@domain.com"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      clearErrors();
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleSendResetEmail}
                    editable={!isLoading}
                  />

                  <AuthPrimaryButton
                    label="SEND RESET CODE"
                    onPress={handleSendResetEmail}
                    loading={isLoading}
                    disabled={isLoading}
                  />
                </>
              )}

              {/* STEP 2: OTP */}
              {step === 'otp' && (
                <>
                  <Text style={styles.stepInstructions} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Enter the 6-digit code sent to <Text style={styles.emailHighlight}>{email}</Text>
                  </Text>

                  <AuthTextInput
                    ref={otpInputRef}
                    label="6-DIGIT CODE"
                    variant="gold"
                    error={fieldError}
                    placeholder="123456"
                    value={otpToken}
                    onChangeText={(text) => {
                      setOtpToken(text.replace(/[^0-9]/g, '').slice(0, 6));
                      clearErrors();
                    }}
                    keyboardType="number-pad"
                    returnKeyType="go"
                    onSubmitEditing={handleVerifyOtp}
                    editable={!isLoading}
                  />

                  <AuthPrimaryButton
                    label="VERIFY CODE"
                    onPress={handleVerifyOtp}
                    loading={isLoading}
                    disabled={isLoading}
                  />

                  <TouchableOpacity
                    style={styles.resendBtn}
                    onPress={handleSendResetEmail}
                    disabled={isLoading || resendCooldown > 0}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.resendBtnText,
                        resendCooldown > 0 && styles.resendBtnDisabled,
                      ]}
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                    >
                      {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* STEP 3: NEW PASSWORD */}
              {step === 'new-password' && (
                <>
                  <Text style={styles.stepInstructions} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Create a new secret password for your account.
                  </Text>

                  <AuthTextInput
                    ref={newPasswordRef}
                    label="NEW PASSWORD"
                    variant="gold"
                    error={fieldError}
                    renderIcon={renderLockIcon}
                    rightAccessory={newPassEyeToggle}
                    placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
                    value={newPassword}
                    onChangeText={(text) => {
                      setNewPassword(text);
                      clearErrors();
                    }}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                    editable={!isLoading}
                  />

                  <AuthTextInput
                    ref={confirmPasswordRef}
                    label="CONFIRM PASSWORD"
                    variant="gold"
                    renderIcon={renderLockCheckIcon}
                    rightAccessory={confirmPassEyeToggle}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      clearErrors();
                    }}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleUpdatePassword}
                    editable={!isLoading}
                  />

                  <AuthPrimaryButton
                    label="SET NEW PASSWORD"
                    onPress={handleUpdatePassword}
                    loading={isLoading}
                    disabled={isLoading}
                  />
                </>
              )}

              {/* STEP 4: SUCCESS */}
              {step === 'success' && (
                <View style={styles.successBox}>
                  <Text style={styles.successTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    PASSWORD UPDATED
                  </Text>
                  <Text style={styles.successText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Your password has been changed successfully. You can now log in with your new credentials.
                  </Text>
                  <AuthPrimaryButton
                    label="RETURN TO LOGIN"
                    onPress={() => onNavigateToLogin?.()}
                  />
                </View>
              )}
            </AuthCard>
          </View>

          {/* Footer Back Link */}
          {step !== 'success' && (
            <View style={styles.footerContainer}>
              <TouchableOpacity onPress={onNavigateToLogin} disabled={isLoading} activeOpacity={0.7}>
                <Text style={styles.backToLoginText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  BACK TO LOGIN
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
    marginVertical: 10,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    width: '100%',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(100, 116, 139, 0.4)',
    borderWidth: 1,
    borderColor: '#475569',
  },
  stepDotActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#fde68a',
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: 'rgba(100, 116, 139, 0.3)',
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: '#f59e0b',
  },
  stepInstructions: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  emailHighlight: {
    color: '#fde68a',
    fontWeight: '700',
  },
  infoBanner: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    width: '100%',
  },
  infoText: {
    color: '#7dd3fc',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  resendBtnText: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '700',
  },
  resendBtnDisabled: {
    color: '#64748b',
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  successTitle: {
    color: '#34d399',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  successText: {
    color: '#cbd5e1',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  footerContainer: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  backToLoginText: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
