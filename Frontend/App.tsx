import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, StyleSheet, View } from 'react-native';
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
import GameScreen from './src/screens/game/GameScreen';
import { supabase } from './src/lib/supabase';
import { createSessionFromUrl } from './src/lib/auth';
import { getDisplayName } from './src/lib/authHelpers';
import { getUsernameStatus, isPlaceholderUsername } from './src/lib/profile';
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
  | 'lobby'
  | 'game';

/** Screens that require a signed-in user. Losing the session on one of these returns to Login. */
const PROTECTED_SCREENS: ReadonlySet<ScreenState> = new Set<ScreenState>([
  'profile-setup',
  'home',
  'create-room',
  'join-room',
  'lobby',
  'game',
]);

/** Pre-auth entry screens. A user becoming authenticated on one of these should be routed onward. */
const AUTH_ENTRY_SCREENS: ReadonlySet<ScreenState> = new Set<ScreenState>([
  'splash',
  'login',
  'signup',
]);

/**
 * Android hardware-back navigation map for the custom screen state machine.
 * Screens absent from this map (home, login, splash) are treated as roots and
 * let the OS handle back (i.e. exit the app).
 */
const BACK_NAVIGATION: Partial<Record<ScreenState, ScreenState>> = {
  signup: 'login',
  'forgot-password': 'login',
  'profile-setup': 'login',
  'create-room': 'home',
  'join-room': 'home',
  lobby: 'home',
  game: 'home',
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('splash');
  const [userAlias, setUserAlias] = useState('Agent');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [initialDestination, setInitialDestination] = useState<ScreenState | null>(null);
  const [splashFinished, setSplashFinished] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<ForgotPasswordStep>('request');

  // Always-current screen value for use inside stable listeners (e.g. BackHandler).
  const currentScreenRef = useRef<ScreenState>(currentScreen);
  currentScreenRef.current = currentScreen;

  /**
   * Decides where a signed-in user goes: Profile Setup until they have chosen a username,
   * Home afterwards.
   */
  const resolveSignedInDestination = useCallback(async (user: User): Promise<ScreenState> => {
    setCurrentUser(user);

    // 1. If user already has a valid chosen username in session metadata, go straight to home
    const metaUsername = user.user_metadata?.username;
    if (metaUsername && !isPlaceholderUsername(metaUsername)) {
      setUserAlias(metaUsername);
      return 'home';
    }

    // 2. Look up username in profiles database
    const status = await getUsernameStatus(user);
    if (status.needsSetup) {
      return 'profile-setup';
    }

    const chosenName = status.username ?? getDisplayName(user);
    setUserAlias(chosenName);

    // 3. Cache to auth metadata so future launches load instantly.
    // Fire-and-forget so navigation is not blocked, but catch rejections so
    // they don't escape as unhandled promise rejections.
    void supabase.auth
      .updateUser({ data: { username: chosenName, username_set: true } })
      .catch(() => {
        // ignore – best-effort cache
      });

    return 'home';
  }, []);

  useEffect(() => {
    let isMounted = true;
    let hasSession = false;

    // 1. Check the persisted Supabase session on app launch
    const checkInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;
        hasSession = !!session?.user;
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

    // Fallback: never let the splash hang forever if session resolution stalls
    // (e.g. getUsernameStatus never resolves). Default to a safe destination.
    const fallbackTimer = setTimeout(() => {
      if (!isMounted) return;
      setInitialDestination((prev) => prev ?? (hasSession ? 'home' : 'login'));
    }, 7000);

    // 2. Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryStep('new-password');
        setCurrentScreen('forgot-password');
      } else if (event === 'USER_UPDATED' && session?.user) {
        setCurrentUser(session.user);
      } else if (event === 'SIGNED_IN' && session?.user) {
        // A user became authenticated outside the normal login-callback path
        // (e.g. magic link / deep link). Route them onward, but only if we are
        // still on a pre-auth entry screen so we don't fight onLoginSuccess or
        // interrupt the recovery flow.
        const destination = await resolveSignedInDestination(session.user);
        if (!isMounted) return;
        setCurrentScreen((prev) => (AUTH_ENTRY_SCREENS.has(prev) ? destination : prev));
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
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleDeepLink({ url });
      })
      .catch(() => {
        // ignore – no initial URL / linking unavailable
      });

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, [resolveSignedInDestination]);

  // Transition from the splash screen to the resolved destination once the
  // splash animation is done and we know where to go. Done in an effect (not
  // in the render body) to avoid setState-during-render.
  useEffect(() => {
    if (splashFinished && initialDestination) {
      setCurrentScreen((prev) => (prev === 'splash' ? initialDestination : prev));
    }
  }, [splashFinished, initialDestination]);

  // Map the Android hardware back button onto the in-app navigation state machine.
  useEffect(() => {
    const onBackPress = () => {
      const screen = currentScreenRef.current;
      const target = BACK_NAVIGATION[screen];
      if (!target) {
        // Root screens (home, login, splash): allow default (exit app).
        return false;
      }
      if (screen === 'lobby' || screen === 'game') {
        setActiveRoom(null);
      }
      setCurrentScreen(target);
      return true;
    };

    const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSub.remove();
  }, []);

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

  const handleStartGame = useCallback(() => {
    // The game row already exists (LobbyScreen called the start_game RPC); every
    // client — host and non-host — routes here off the lobby's realtime signal.
    setCurrentScreen('game');
  }, []);

  const handleExitGame = useCallback(() => {
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
            onStartGame={handleStartGame}
          />
        )}

        {currentScreen === 'game' && activeRoom && currentUser && (
          <GameScreen
            room={activeRoom}
            currentUserId={currentUser.id}
            onExit={handleExitGame}
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
