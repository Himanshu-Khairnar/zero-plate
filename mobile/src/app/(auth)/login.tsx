import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type TextInputInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_URL } from "@/api/client";
import { Button, Card, Input, Text } from "@/components";
import { useAuth } from "@/context/auth";
import { space, useTheme } from "@/theme";

const DEMO = { email: "owner@wasteless.local", password: "Password123!" };

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="primary">
              Zero Plate
            </Text>
            <Text variant="title" style={{ fontSize: 28, lineHeight: 34 }}>
              Cook what sells.{"\n"}Waste less.
            </Text>
            <Text variant="caption" tone="muted">
              Sign in to your restaurant workspace.
            </Text>
          </View>

          <Card>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@restaurant.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Input
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            {error ? (
              <Text variant="caption" tone="destructive">
                {error}
              </Text>
            ) : null}
            <Button title="Sign in" size="lg" loading={busy} onPress={submit} />
          </Card>

          <Pressable
            onPress={() => {
              setEmail(DEMO.email);
              setPassword(DEMO.password);
              setError(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Fill demo account"
          >
            <Card style={{ backgroundColor: colors.secondary, borderColor: colors.secondary, gap: space.xs }}>
              <Text variant="label" tone="muted">
                Demo account - tap to fill
              </Text>
              <Text variant="caption">{DEMO.email}</Text>
              <Text variant="caption">{DEMO.password}</Text>
            </Card>
          </Pressable>

          <Text variant="caption" tone="muted" style={{ textAlign: "center", fontSize: 11 }}>
            Server: {API_URL}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
