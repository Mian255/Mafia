import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { User } from '@supabase/supabase-js';
import SplashScreen from './src/screens/auth/SplashScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import ForgotPasswordScreen, { ForgotPasswordStep } from './src/screens/auth/ForgotPasswordScreen';
import ProfileSetupScreen from './src/screens/auth/ProfileSetupScreen';
import HomeScreen from './src/screens/main/HomeScreen';
import CreateRoomScreen from './src/screens/room/CreateRoomScreen';
import JoinRoomScreen from './src/screens/room/JoinRoomScreen';
import LobbyScreen from './src/screens/room/LobbyScreen';
import { supabase } from './src/lib/supabase';
import { createSessionFromUrl } from './src/lib/auth';
import { getDisplayName } from './src/lib/authHelpers';
import { getUsernameStatus } from './src/lib/profile';
import type { Room } from './src/lib/rooms';

type ScreenState =
  | 'splash'
  | 'login'
  | 'signup'
  | 'forgot-password'
  | 'profile-setup'
  | 'home'
  | 'create-room'
  | 'join-room'
  | 'lobby';

/** Screens that require a signed-in user. Losing the session on one of these returns to Login. */
const PROTECTED_SCREENS: ReadonlySet<ScreenState> = new Set<ScreenState>([
  'profile-setup',
  'home',
  'create-room',
  'join-room',
  'lobby',
]);

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('splash');
  const [userAlias, setUserAlias] = useState('Agent');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [initialDestination, setInitialDestination] = useState<ScreenState | null>(null);
  const [splashFinished, setSplashFinished] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<ForgotPasswordStep>('request');

  /**
   * Decides where a signed-in user goes: Profile Setup until they have chosen a username,
   * Home afterwards.
   */
  const resolveSignedInDestination = useCallback(async (user: User): Promise<ScreenState> => {
    setCurrentUser(user);
    if (user.user_metadata?.username) {
      setUserAlias(user.user_metadata.username);
      return 'home';
    }

    const status = await getUsernameStatus(user);
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

    // 2. Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryStep('new-password');
        setCurrentScreen('forgot-password');
      } else if (event === 'USER_UPDATED' && session?.user) {
        setCurrentUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUserAlias('Agent');
        setCurrentUser(null);
        setActiveRoom(null);
        setInitialDestination('login');
        setCurrentScreen((prev) => (PROTECTED_SCREENS.has(prev) ? 'login' : prev));
      }
    });

    // 3. Handle deep linking when app is opened via URL (e.g. mafia://)
    const handleDeepLink = async (event: { url: string }) => {
      if (event.url) {
        try {
          const session = await createSessionFromUrl(event.url);
          if (session && event.url.includes('type=recovery')) {
            setRecoveryStep('new-password');
            setCurrentScreen('forgot-password');
          }
        } catch {
          // Handled or non-recovery link
        }
      }
    };

    const linkingSub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, [resolveSignedInDestination]);

  if (currentScreen === 'splash' && splashFinished && initialDestination) {
    setCurrentScreen(initialDestination);
  }

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

  const goToLogin = useCallback(() => {
    setRecoveryStep('request');
    setCurrentScreen('login');
  }, []);

  const goToSignUp = useCallback(() => setCurrentScreen('signup'), []);

  const goToForgotPassword = useCallback(() => {
    setRecoveryStep('request');
    setCurrentScreen('forgot-password');
  }, []);

  const handleRoomCreated = useCallback((room: Room) => {
    setActiveRoom(room);
    setCurrentScreen('lobby');
  }, []);

  const handleRoomJoined = useCallback((room: Room) => {
    setActiveRoom(room);
    setCurrentScreen('lobby');
  }, []);

  const handleLeaveLobby = useCallback(() => {
    setActiveRoom(null);
    setCurrentScreen('home');
  }, []);

  return (
    <SafeAreaProvider>
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
          <SignUpScreen
            onNavigateToLogin={goToLogin}
            onSignUpSuccess={handleAuthenticated}
          />
        )}

        {currentScreen === 'forgot-password' && (
          <ForgotPasswordScreen
            initialStep={recoveryStep}
            onNavigateToLogin={goToLogin}
          />
        )}

        {currentScreen === 'profile-setup' && currentUser && (
          <ProfileSetupScreen
            user={currentUser}
            onComplete={handleProfileComplete}
          />
        )}

        {currentScreen === 'home' && (
          <HomeScreen
            userAlias={userAlias}
            onCreateRoom={() => setCurrentScreen('create-room')}
            onJoinRoom={() => setCurrentScreen('join-room')}
            onLogout={() => {
              setUserAlias('Agent');
              setCurrentUser(null);
              setActiveRoom(null);
              setCurrentScreen('login');
            }}
          />
        )}

        {currentScreen === 'create-room' && (
          <CreateRoomScreen
            onBack={() => setCurrentScreen('home')}
            onRoomCreated={handleRoomCreated}
          />
        )}

        {currentScreen === 'join-room' && (
          <JoinRoomScreen
            onBack={() => setCurrentScreen('home')}
            onRoomJoined={handleRoomJoined}
          />
        )}

        {currentScreen === 'lobby' && activeRoom && currentUser && (
          <LobbyScreen
            room={activeRoom}
            currentUserId={currentUser.id}
            onLeave={handleLeaveLobby}
            onStartGame={(roomId) => {
              // Future Phase 4: Route to GameScreen
              console.log('Game Starting for room:', roomId);
            }}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
});
