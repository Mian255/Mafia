import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import SplashScreen from './src/screens/auth/SplashScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
import HomeScreen from './src/screens/main/HomeScreen';
import { supabase } from './src/lib/supabase';
import { getDisplayName } from './src/lib/authHelpers';

type ScreenState = 'splash' | 'login' | 'signup' | 'forgot-password' | 'home';

/** Screens that require a signed-in user. Losing the session on one of these returns to Login. */
const PROTECTED_SCREENS: ReadonlySet<ScreenState> = new Set<ScreenState>(['home']);

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('splash');
  const [userAlias, setUserAlias] = useState('Agent');
  const [initialDestination, setInitialDestination] = useState<ScreenState | null>(null);
  const [splashFinished, setSplashFinished] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 1. Check the persisted Supabase session on app launch
    const checkInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (session?.user) {
          setUserAlias(getDisplayName(session.user));
          setInitialDestination('home');
        } else {
          setInitialDestination('login');
        }
      } catch {
        if (isMounted) setInitialDestination('login');
      }
    };

    checkInitialSession();

    // 2. Subscribe to auth state changes (login, logout, token refresh, session expiry)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
          setUserAlias(getDisplayName(session.user));
        }
        return;
      }

      // SIGNED_OUT fires on explicit sign-out and when the session can no longer be refreshed
      // (expired/revoked refresh token), so both cases route back to Login.
      if (event === 'SIGNED_OUT') {
        setUserAlias('Agent');
        setInitialDestination('login');
        setCurrentScreen((prev) => (PROTECTED_SCREENS.has(prev) ? 'login' : prev));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Leave the splash screen once its animation is done AND the session check has finished,
  // so a logged-in user is never briefly shown the login screen.
  useEffect(() => {
    if (splashFinished && initialDestination) {
      setCurrentScreen((prev) => (prev === 'splash' ? initialDestination : prev));
    }
  }, [splashFinished, initialDestination]);

  const handleSplashFinish = useCallback(() => {
    setSplashFinished(true);
  }, []);

  const handleAuthenticated = (alias: string) => {
    setUserAlias(alias);
    setCurrentScreen('home');
  };

  return (
    <View style={styles.container}>
      {currentScreen === 'splash' && (
        <SplashScreen durationMs={2800} onFinish={handleSplashFinish} />
      )}

      {currentScreen === 'login' && (
        <LoginScreen
          onNavigateToSignUp={() => setCurrentScreen('signup')}
          onNavigateToForgotPassword={() => setCurrentScreen('forgot-password')}
          onLoginSuccess={(user) => handleAuthenticated(getDisplayName(user))}
        />
      )}

      {currentScreen === 'signup' && (
        <SignUpScreen
          onNavigateToLogin={() => setCurrentScreen('login')}
          onSignUpSuccess={handleAuthenticated}
        />
      )}

      {currentScreen === 'forgot-password' && (
        <ForgotPasswordScreen onNavigateToLogin={() => setCurrentScreen('login')} />
      )}

      {currentScreen === 'home' && (
        <HomeScreen
          userAlias={userAlias}
          onLogout={() => {
            setUserAlias('Agent');
            setCurrentScreen('login');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
});
