import React, { useEffect, useState } from 'react';
import {
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

interface SignUpScreenProps {
  onNavigateToLogin?: () => void;
  onSignUpSuccess?: (alias: string) => void;
}

export default function SignUpScreen({ onNavigateToLogin, onSignUpSuccess }: SignUpScreenProps) {
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  const handleSignUp = async () => {
    if (!alias.trim()) {
      setErrorMessage('Please choose your in-game alias.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Passcode must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passcodes do not match.');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: alias.trim(),
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
      } else if (data?.user) {
        if (onSignUpSuccess) {
          onSignUpSuccess(alias.trim());
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setErrorMessage(msg);
    } finally {
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
              <View style={styles.badgeRow}>
                <View style={styles.crimsonDot} />
                <Text style={styles.badgeText}>NEW OPERATIVE</Text>
                <View style={styles.blueDot} />
              </View>
              <Text style={styles.title}>REGISTER</Text>
              <Text style={styles.subtitle}>Create your alias in the underground</Text>
            </View>

            {/* Error Message */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Form */}
            <View style={styles.form}>
              {/* Alias */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>In-Game Alias</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. ShadowVito or InspectorHolt"
                  placeholderTextColor="#475569"
                  value={alias}
                  onChangeText={(text) => {
                    setAlias(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  autoCapitalize="none"
                  maxLength={20}
                />
              </View>

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
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
                />
              </View>

              {/* Passcode */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Secret Passcode</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor="#475569"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              {/* Confirm Passcode */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm Passcode</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Repeat passcode"
                  placeholderTextColor="#475569"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                onPress={handleSignUp}
                activeOpacity={0.85}
                disabled={isLoading}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoading ? 'ENROLLING ALIAS...' : 'CREATE IDENTITY'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer Navigation */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an alias?</Text>
              <TouchableOpacity onPress={onNavigateToLogin} activeOpacity={0.7}>
                <Text style={styles.loginLink}> Log In</Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  crimsonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e11d48',
    marginRight: 8,
  },
  blueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38bdf8',
    marginLeft: 8,
  },
  badgeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 4,
    textShadowColor: 'rgba(56, 189, 248, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
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
    marginBottom: 16,
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#07090e',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  footerText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  loginLink: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '700',
  },
});
