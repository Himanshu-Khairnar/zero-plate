import { Stack } from "expo-router";
import { View } from "react-native";

import { Button, Text } from "@/components";
import { useSession } from "@/context/auth";
import { OutletProvider } from "@/context/outlet";
import { space, useTheme } from "@/theme";

export default function AppLayout() {
  const { outlets, logout } = useSession();
  const { colors } = useTheme();

  if (outlets.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: colors.background }}>
        <Text variant="heading">No outlets yet</Text>
        <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
          Your account has no outlets. Create one in the Zero Plate web app, then sign in again.
        </Text>
        <Button title="Log out" variant="outline" onPress={() => void logout()} />
      </View>
    );
  }

  return (
    <OutletProvider outlets={outlets}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="waste-log" options={{ presentation: "modal" }} />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="forecasts" />
        <Stack.Screen name="donations" />
        <Stack.Screen name="assistant" />
      </Stack>
    </OutletProvider>
  );
}
