import { useEffect, useState } from "react";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";

import { AppStateProvider } from "@/state/appState";
import { IntakeStateProvider } from "@/state/intakeState";
import { LogsProvider } from "@/state/logs";
import { WeeklyProvider } from "@/state/weekly";
import { ThemeProvider, tokens } from "@/theme";
import { supabase } from "@/lib/supabase";

SplashScreen.preventAutoHideAsync().catch(() => {
  // keep splash visible until everything is ready
});

export default function RootLayout() {
  const segments = useSegments();
  const [authLoading, setAuthLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsSignedIn(Boolean(data.session));
      setAuthLoading(false);
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
    });
    return () => {
      mounted = false;
      sub.subscription?.unsubscribe();
    };
  }, []);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  const top = segments[0];
  const protectedRoute = top === "(tabs)" || top === "onboarding2";

  // Important: always render providers; auth/session guards are enforced inside route screens/layouts

  return (
    <ThemeProvider>
      <AppStateProvider>
        <IntakeStateProvider>
          <LogsProvider>
            <WeeklyProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: tokens.color.background },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding2" options={{ headerShown: false }} />
                <Stack.Screen name="auth/index" options={{ headerShown: false }} />
                <Stack.Screen name="paywall" options={{ headerShown: false }} />
                <Stack.Screen name="weekly" options={{ headerShown: false }} />
                <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
              </Stack>
            </WeeklyProvider>
          </LogsProvider>
        </IntakeStateProvider>
      </AppStateProvider>
    </ThemeProvider>
  );
}
