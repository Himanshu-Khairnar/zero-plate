import {
  SourceCodePro_400Regular,
  SourceCodePro_500Medium,
  SourceCodePro_600SemiBold,
  SourceCodePro_700Bold,
  useFonts,
} from "@expo-google-fonts/source-code-pro";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiError } from "@/api/client";
import { AuthProvider, useAuth } from "@/context/auth";
import { useTheme } from "@/theme";

void SplashScreen.preventAutoHideAsync();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Don't retry auth/permission/validation errors; retry network/5xx once.
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
      },
    },
  });
}

function RootNavigator() {
  const { state } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (state.status !== "loading") void SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === "loading") return null;
  const signedIn = state.status === "signedIn";

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  const { colors, isDark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    SourceCodePro_400Regular,
    SourceCodePro_500Medium,
    SourceCodePro_600SemiBold,
    SourceCodePro_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
      notification: colors.primary,
    },
  };

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navTheme}>
          <AuthProvider>
            <StatusBar style={isDark ? "light" : "dark"} />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
