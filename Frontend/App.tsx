import React, { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SplashScreen from "./src/screens/auth/SplashScreen";
import LoginScreen from "./src/screens/auth/LoginScreen";
import SignUpScreen from "./src/screens/auth/SignUpScreen";
import ForgotPasswordScreen, { ForgotPasswordStep } from "./src/screens/auth/ForgotPasswordScreen";
import HomeScreen from "./src/screens/main/HomeScreen";
import { supabase } from "./src/lib/supabase";
import { createSessionFromUrl } from "./src/lib/auth";

type ScreenState = "splash" | "login" | "signup" | "forgot-password" | "home";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>("splash");
  const [userAlias, setUserAlias] = useState("Agent");
  const [initialDestination, setInitialDestination] = useState<ScreenState | null>(null);
  const [recoveryStep, setRecoveryStep] = useState<ForgotPasswordStep>("request");

  useEffect(() => {
    // 1. Check existing Supabase session on app launch
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const alias =
            session.user.user_metadata?.username ||
            session.user.user_metadata?.full_name ||
            session.user.email?.split("@")[0] ||
            (session.user.is_anonymous
              ? `Guest_${session.user.id.slice(0, 4).toUpperCase()}`
              : "Operative");
          setUserAlias(alias);
          setInitialDestination("home");
        } else {
          setInitialDestination("login");
        }
      } catch {
        setInitialDestination("login");
      }
    };

    checkInitialSession();

    // 2. Subscribe to auth state changes (login, logout, token refresh, password recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryStep("new-password");
        setCurrentScreen("forgot-password");
      } else if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        const alias =
          session.user.user_metadata?.username ||
          session.user.user_metadata?.full_name ||
          session.user.email?.split("@")[0] ||
          (session.user.is_anonymous
            ? `Guest_${session.user.id.slice(0, 4).toUpperCase()}`
            : "Operative");
        setUserAlias(alias);
      } else if (event === "SIGNED_OUT") {
        setUserAlias("Agent");
        setCurrentScreen("login");
      }
    });

    // 3. Handle deep linking when app is opened via URL (e.g. mafia://)
    const handleDeepLink = async (event: { url: string }) => {
      if (event.url) {
        try {
          const session = await createSessionFromUrl(event.url);
          if (session && event.url.includes("type=recovery")) {
            setRecoveryStep("new-password");
            setCurrentScreen("forgot-password");
          }
        } catch {
          // Handled or non-recovery link
        }
      }
    };

    const linkingSub = Linking.addEventListener("url", handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  const handleSplashFinish = () => {
    // Navigate to Home if user is logged in, otherwise Login
    setCurrentScreen(initialDestination || "login");
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {currentScreen === "splash" && (
          <SplashScreen durationMs={2800} onFinish={handleSplashFinish} />
        )}

        {currentScreen === "login" && (
          <LoginScreen
            onNavigateToSignUp={() => setCurrentScreen("signup")}
            onNavigateToForgotPassword={() => {
              setRecoveryStep("request");
              setCurrentScreen("forgot-password");
            }}
            onLoginSuccess={(alias) => {
              setUserAlias(alias);
              setCurrentScreen("home");
            }}
          />
        )}

        {currentScreen === "signup" && (
          <SignUpScreen
            onNavigateToLogin={() => setCurrentScreen("login")}
            onSignUpSuccess={(alias) => {
              setUserAlias(alias);
              setCurrentScreen("home");
            }}
          />
        )}

        {currentScreen === "forgot-password" && (
          <ForgotPasswordScreen
            initialStep={recoveryStep}
            onNavigateToLogin={() => {
              setRecoveryStep("request");
              setCurrentScreen("login");
            }}
          />
        )}

        {currentScreen === "home" && (
          <HomeScreen
            userAlias={userAlias}
            onLogout={() => {
              setUserAlias("Agent");
              setCurrentScreen("login");
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
    backgroundColor: "#07090e",
  },
});
