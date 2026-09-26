import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { User } from '@supabase/supabase-js';
import SplashScreen from './src/screens/auth/SplashScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
import ProfileSetupScreen from './src/screens/auth/ProfileSetupScreen';
import HomeScreen from './src/screens/main/HomeScreen';
import { supabase } from './src/lib/supabase';
import { getDisplayName } from './src/lib/authHelpers';
import { getUsernameStatus } from './src/lib/profile';

type ScreenState = 'splash' | 'login' | 'signup' | 'forgot-password' | 'profile-setup' | 'home';

/** Screens that require a signed-in user. Losing the session on one of these returns to Login. */
const PROTECTED_SCREENS: ReadonlySet<ScreenState> = new Set<ScreenState>(['profile-setup', 'home']);

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('splash');
  const [userAlias, setUserAlias] = useState('Agent');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initialDestination, setInitialDestination] = useState<ScreenState | null>(null);
  const [splashFinished, setSplashFinished] = useState(false);

  /**
   * Decides where a signed-in user goes: Profile Setup until they have chosen a username,
   * Home afterwards. Guests (anonymous) always go straight Home.
   */
  const resolveSignedInDestination = useCallback(async (user: User): Promise<ScreenState> => {
    const status = await getUsernameStatus(user);
    setCurrentUser(user);
    if (status.needsSetup) return 'profile-setup';
    setUserAlias(status.username ?? getDisplayName(user));
    return 'home';
  }, []);

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
          const destination = await resolveSignedInDestination(session.user);
          if (isMounted) setInitialDestination(destination);
        } else {
          setInitialDestination('login');
        }
      } catch {
        if (isMounted) setInitialDestination('login');
      }
    };

    checkInitialSession();

    // 2. Subscribe to auth state changes. Signing in is routed explicitly by the screens
    //    (via handleAuthenticated) so the Login screen can reject brand-new Google users before
    //    anything is shown; here we only react to profile updates and to losing the session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'USER_UPDATED' && session?.user) {
        setCurrentUser(session.user);
        return;
      }

      // SIGNED_OUT fires on explicit sign-out and when the session can no longer be refreshed
      // (expired/revoked refresh token), so both cases route back to Login.
      if (event === 'SIGNED_OUT') {
        setUserAlias('Agent');
        setCurrentUser(null);
        setInitialDestination('login');
        setCurrentScreen((prev) => (PROTECTED_SCREENS.has(prev) ? 'login' : prev));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [resolveSignedInDestination]);

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

  /** Called by Login / Sign Up once Supabase returned a session for an allowed user. */
  const handleAuthenticated = useCallback(
    async (user: User) => {
      const destination = await resolveSignedInDestination(user);
      setCurrentScreen(destination);
    },
    [resolveSignedInDestination]
  );

  const handleProfileComplete = useCallback((username: string) => {
    setUserAlias(username);
    setCurrentScreen('home');
  }, []);

  const goToLogin = useCallback(() => setCurrentScreen('login'), []);
  const goToSignUp = useCallback(() => setCurrentScreen('signup'), []);
  const goToForgotPassword = useCallback(() => setCurrentScreen('forgot-password'), []);

  return (
    <View style={styles.container}>
      {currentScreen === 'splash' && (
        <SplashScreen durationMs={2800} onFinish={handleSplashFinish} />
      )}

      {currentScreen === 'login' && (
        <LoginScreen
          onNavigateToSignUp={goToSignUp}
          onNavigateToForgotPassword={goToForgotPassword}
          onLoginSuccess={handleAuthenticated}
        />
      )}

      {currentScreen === 'signup' && (
        <SignUpScreen onNavigateToLogin={goToLogin} onSignUpSuccess={handleAuthenticated} />
      )}

      {currentScreen === 'forgot-password' && (
        <ForgotPasswordScreen onNavigateToLogin={goToLogin} />
      )}

      {currentScreen === 'profile-setup' && currentUser && (
        <ProfileSetupScreen user={currentUser} onComplete={handleProfileComplete} />
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
