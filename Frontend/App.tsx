import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
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
import GameScreen from './src/screens/game/GameScreen';
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

/** Pre-auth entry screens. A user becoming authenticated on one of these should be routed onward. */
const AUTH_ENTRY_SCREENS: ReadonlySet<ScreenState> = new Set<ScreenState>([
  'splash',
  'login',
  'signup',
]);

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('splash');
  const [navigationHistory, setNavigationHistory] = useState<ScreenState[]>(['splash']);
  const [userAlias, setUserAlias] = useState('Agent');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [initialDestination, setInitialDestination] = useState<ScreenState | null>(null);
  const [splashFinished, setSplashFinished] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<ForgotPasswordStep>('request');

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
    if (currentScreen === 'lobby') {
      setActiveRoom(null);
      setCurrentScreen('home');
      setNavigationHistory(['home']);
      return true;
    }

    if (currentScreen === 'game') {
      setActiveRoom(null);
      setCurrentScreen('home');
      setNavigationHistory(['home']);
      return true;
    }

    if (currentScreen === 'signup' || currentScreen === 'forgot-password') {
      setRecoveryStep('request');
      setCurrentScreen('login');
      setNavigationHistory(['login']);
      return true;
    }

    if (currentScreen === 'create-room' || currentScreen === 'join-room' || currentScreen === 'profile-setup') {
      setCurrentScreen('home');
      setNavigationHistory(['home']);
      return true;
    }

    if (navigationHistory.length > 1) {
      const newHistory = [...navigationHistory];
      newHistory.pop();
      const previousScreen = newHistory[newHistory.length - 1];
      setNavigationHistory(newHistory);
      setCurrentScreen(previousScreen);
      return true;
    }

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

  useEffect(() => {
    const handleHardwareBackPress = () => goBack();
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

    const metaUsername = user.user_metadata?.username;
    if (metaUsername && !isPlaceholderUsername(metaUsername)) {
      setUserAlias(metaUsername);
      return 'home';
    }

    const status = await getUsernameStatus(user);
    if (status.needsSetup) {
      return 'profile-setup';
    }

    const chosenName = status.username ?? getDisplayName(user);
    setUserAlias(chosenName);

    void supabase.auth
      .updateUser({ data: { username: chosenName, username_set: true } })
      .catch(() => {});

    return 'home';
  }, []);

  useEffect(() => {
    let isMounted = true;
    let hasSession = false;

    const checkInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;
        hasSession = !!session?.user;
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

    const fallbackTimer = setTimeout(() => {
      if (!isMounted) return;
      setInitialDestination((prev) => prev ?? (hasSession ? 'home' : 'login'));
    }, 7000);

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

    const handleDeepLink = async (event: { url: string }) => {
      if (event.url) {
        try {
          const session = await createSessionFromUrl(event.url);
          if (session) {
            try {
              const WebBrowser = require("expo-web-browser");
              if (typeof WebBrowser?.dismissAuthSession === "function") {
                WebBrowser.dismissAuthSession();
              }
            } catch {}
          }
          if (session && event.url.includes('type=recovery')) {
            setRecoveryStep('new-password');
            setCurrentScreen('forgot-password');
            setNavigationHistory((prev) => [...prev, 'forgot-password']);
          }
        } catch {}
      }
    };

    const linkingSub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleDeepLink({ url });
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, [resolveSignedInDestination]);

  const handleSplashFinish = useCallback(() => {
    splashFinishedRef.current = true;
    setSplashFinished(true);
    const destination = initialDestination || "login";
    setCurrentScreen(destination);
    setNavigationHistory([destination]);
  }, [initialDestination]);

  useEffect(() => {
    if (splashFinished && initialDestination && currentScreen === 'splash') {
      setCurrentScreen(initialDestination);
      setNavigationHistory([initialDestination]);
    }
  }, [splashFinished, initialDestination, currentScreen]);

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

  const handleStartGame = useCallback(() => {
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

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RootErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Oops! Something went wrong.</Text>
            <Text style={styles.errorMessage}>
              {this.state.error?.message || 'An unexpected issue occurred.'}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={styles.retryButtonText}>Restart App</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RootErrorBoundary>
      <AppContent />
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#07090e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ff4444',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#b0b8c4',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#e63946',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
