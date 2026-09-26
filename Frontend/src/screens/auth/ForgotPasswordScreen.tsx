import React, { useEffect, useRef, useState } from 'react';
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
import { getFriendlyAuthError, validateEmail } from '../../lib/authHelpers';

interface ForgotPasswordScreenProps {
  onNavigateToLogin?: () => void;
}

export default function ForgotPasswordScreen({ onNavigateToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Synchronous guard so rapid double taps can't send two recovery emails.
  const requestInFlight = useRef(false);

  // Animations
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

  const handleSendRecovery = async () => {
    if (requestInFlight.current) return;

    const trimmedEmail = email.trim();
    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setErrorMessage(emailError);
      return;
    }

    setErrorMessage('');
    requestInFlight.current = true;
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (error) {
        setErrorMessage(getFriendlyAuthError(error, 'Failed to send recovery email.'));
      } else {
        setSubmittedEmail(trimmedEmail);
        setIsSubmitted(true);
      }
    } catch (err: unknown) {
      setErrorMessage(getFriendlyAuthError(err, 'Failed to send recovery email.'));
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  };

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
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>{isSubmitted ? '📩' : '🔐'}</Text>
              </View>
              <Text style={styles.title}>{isSubmitted ? 'DISPATCH SENT' : 'RECOVER ACCESS'}</Text>
              <Text style={styles.subtitle}>
                {isSubmitted
                  ? `A secret recovery link has been transmitted to ${submittedEmail}`
                  : 'Enter your registered email address to receive instructions.'}
              </Text>
            </View>

            {/* Error message */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {isSubmitted ? (
              <View style={styles.successContainer}>
                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    Check your spam and encrypted channels if the email doesn&apos;t arrive in 2
                    minutes.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onNavigateToLogin}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>RETURN TO LOGIN</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={() => setIsSubmitted(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resendText}>Try another email address</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Registered Email</Text>
                  <TextInput
                    style={[styles.input, !!errorMessage && styles.inputError]}
                    placeholder="operative@domain.com"
                    placeholderTextColor="#475569"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errorMessage) setErrorMessage('');
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    importantForAutofill="yes"
                    returnKeyType="send"
                    onSubmitEditing={handleSendRecovery}
                    editable={!isLoading}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleSendRecovery}
                  activeOpacity={0.85}
                  disabled={isLoading}
                  accessibilityState={{ disabled: isLoading, busy: isLoading }}
                >
                  <View style={styles.buttonContent}>
                    {isLoading ? (
                      <ActivityIndicator color="#ffffff" size="small" style={styles.buttonSpinner} />
                    ) : null}
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'TRANSMITTING...' : 'SEND RECOVERY LINK'}
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
    marginBottom: 26,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 28,
  },
  title: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
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
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: '#f8fafc',
    fontSize: 15,
  },
  inputError: {
    borderColor: '#e11d48',
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
    backgroundColor: '#e11d48',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  backButton: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  backText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  successContainer: {
    width: '100%',
  },
  tipBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    padding: 14,
    marginBottom: 24,
  },
  tipText: {
    color: '#bae6fd',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  resendText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
});
