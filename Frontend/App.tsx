import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, StyleSheet, ToastAndroid, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { User } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { createSessionFromUrl } from './src/lib/auth';
import { getDisplayName } from './src/lib/authHelpers';
import {
  CreateRoomScreen,
  ForgotPasswordScreen,
  ForgotPasswordStep,
  HomeScreen,
  JoinRoomScreen,
  LobbyScreen,
  LoginScreen,
  ProfileSetupScreen,
  SignUpScreen,
  SplashScreen,
} from './src/screens';
import { getUsernameStatus, isPlaceholderUsername } from './src/lib/profile';
import { useAudioSettings } from './src/lib/audioSettings';
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
  const [navigationHistory, setNavigationHistory] = useState<ScreenState[]>(['splash']);
  const [userAlias, setUserAlias] = useState('Agent');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [initialDestination, setInitialDestination] = useState<ScreenState | null>(null);
  const [splashFinished, setSplashFinished] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<ForgotPasswordStep>('request');
  const audio = useAudioSettings();

  const splashFinishedRef = useRef(false);
  const lastBackPressTimeRef = useRef<number>(0);

  /**
   * Navigate to a screen with history stack management.
   */
  const navigate = useCallback((screen: ScreenState, replace = false) => {
    setCurrentScreen(screen);
    setNavigationHistory((prev) => {
      if (replace) {
        const next = [...prev];
        next[next.length - 1] = screen;
        return next;
      }
      return [...prev, screen];
    });
  }, []);

  /**
   * Go back to the previous screen in history.
   */
  const goBack = useCallback((): boolean => {
    // If currently in lobby, leave lobby cleanly
    if (currentScreen === 'lobby') {
      setActiveRoom(null);
      setCurrentScreen('home');
      setNavigationHistory(['home']);
      return true;
    }

    // If on non-root auth screens, return to login
    if (currentScreen === 'signup' || currentScreen === 'forgot-password') {
      setRecoveryStep('request');
      setCurrentScreen('login');
      setNavigationHistory(['login']);
      return true;
    }

    // If on room creation or join, return to home
    if (currentScreen === 'create-room' || currentScreen === 'join-room') {
      setCurrentScreen('home');
      setNavigationHistory(['home']);
      return true;
    }

    // If there is history to pop
    if (navigationHistory.length > 1) {
      const newHistory = [...navigationHistory];
      newHistory.pop(); // remove current
      const previousScreen = newHistory[newHistory.length - 1];
      setNavigationHistory(newHistory);
      setCurrentScreen(previousScreen);
      return true;
    }

    // If on home or login root screens, handle double tap to exit on Android
    if (currentScreen === 'home' || currentScreen === 'login') {
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPressTimeRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      return true;
    }

    return false;
  }, [currentScreen, navigationHistory]);

  // Hardware/gesture BackHandler subscription
  useEffect(() => {
    const handleHardwareBackPress = () => {
      return goBack();
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBackPress
    );

    return () => backSubscription.remove();
  }, [goBack]);

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

    // 3. Cache to auth metadata so future launches load instantly
    try {
      supabase.auth.updateUser({ data: { username: chosenName, username_set: true } });
    } catch {
      // ignore
    }

    return 'home';
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Check the persisted Supabase session from AsyncStorage on app launch
    const checkInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          const destination = await resolveSignedInDestination(session.user);
          if (isMounted) {
            setInitialDestination(destination);
            if (splashFinishedRef.current) {
              setCurrentScreen(destination);
              setNavigationHistory([destination]);
            }
          }
        } else {
          if (isMounted) {
            setInitialDestination('login');
            if (splashFinishedRef.current) {
              setCurrentScreen('login');
              setNavigationHistory(['login']);
            }
          }
        }
      } catch {
        if (isMounted) {
          setInitialDestination('login');
          if (splashFinishedRef.current) {
            setCurrentScreen('login');
            setNavigationHistory(['login']);
          }
        }
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
        setNavigationHistory((prev) => [...prev, 'forgot-password']);
      } else if (event === 'SIGNED_IN' && session?.user) {
        const destination = await resolveSignedInDestination(session.user);
        if (isMounted) {
          setInitialDestination(destination);
          if (splashFinishedRef.current) {
            setCurrentScreen(destination);
            setNavigationHistory([destination]);
          }
        }
      } else if (event === 'USER_UPDATED' && session?.user) {
        setCurrentUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUserAlias('Agent');
        setCurrentUser(null);
        setActiveRoom(null);
        setInitialDestination('login');
        setCurrentScreen('login');
        setNavigationHistory(['login']);
      }
    });

    // 3. Handle deep linking when app is opened via URL (e.g. mafia://)
    const handleDeepLink = async (event: { url: string }) => {
      if (event.url) {
        try {
          const session = await createSessionFromUrl(event.url);
          if (session) {
            try {
              const WebBrowser = require("expo-web-browser");
              WebBrowser.dismissAuthSession();
            } catch {}
          }
          if (session && event.url.includes('type=recovery')) {
            setRecoveryStep('new-password');
            setCurrentScreen('forgot-password');
            setNavigationHistory((prev) => [...prev, 'forgot-password']);
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

  // Handle transition when splash finishes
  const handleSplashFinish = useCallback(() => {
    splashFinishedRef.current = true;
    setSplashFinished(true);
    const destination = initialDestination || "login";
    setCurrentScreen(destination);
    setNavigationHistory([destination]);
  }, [initialDestination]);

  // When initialDestination is determined after splash has already finished
  useEffect(() => {
    if (splashFinished && initialDestination && currentScreen === 'splash') {
      setCurrentScreen(initialDestination);
      setNavigationHistory([initialDestination]);
    }
  }, [splashFinished, initialDestination, currentScreen]);

  /** Called by Login / Sign Up once Supabase returned a session for an allowed user. */
  const handleAuthenticated = useCallback(
    async (user: User) => {
      const destination = await resolveSignedInDestination(user);
      setCurrentScreen(destination);
      setNavigationHistory([destination]);
    },
    [resolveSignedInDestination]
  );

  const handleProfileComplete = useCallback((username: string) => {
    setUserAlias(username);
    setCurrentScreen('home');
    setNavigationHistory(['home']);
  }, []);

  const goToLogin = useCallback(() => {
    setRecoveryStep('request');
    navigate('login');
  }, [navigate]);

  const goToSignUp = useCallback(() => navigate('signup'), [navigate]);

  const goToForgotPassword = useCallback(() => {
    setRecoveryStep('request');
    navigate('forgot-password');
  }, [navigate]);

  const handleRoomCreated = useCallback(
    (room: Room) => {
      setActiveRoom(room);
      navigate('lobby');
    },
    [navigate]
  );

  const handleRoomJoined = useCallback(
    (room: Room) => {
      setActiveRoom(room);
      navigate('lobby');
    },
    [navigate]
  );

  const handleLeaveLobby = useCallback(() => {
    setActiveRoom(null);
    setCurrentScreen('home');
    setNavigationHistory(['home']);
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
            soundEffects={audio.soundEffects}
            onCreateRoom={() => navigate('create-room')}
            onJoinRoom={() => navigate('join-room')}
            onLogout={() => {
              setUserAlias('Agent');
              setCurrentUser(null);
              setActiveRoom(null);
              setCurrentScreen('login');
              setNavigationHistory(['login']);
            }}
          />
        )}

        {currentScreen === 'create-room' && (
          <CreateRoomScreen
            onBack={goBack}
            onRoomCreated={handleRoomCreated}
          />
        )}

        {currentScreen === 'join-room' && (
          <JoinRoomScreen
            onBack={goBack}
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
