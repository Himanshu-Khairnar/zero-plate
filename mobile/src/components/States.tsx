import { ActivityIndicator, View } from "react-native";

import { space, useTheme } from "@/theme";
import { Button } from "./Button";
import { Card } from "./Card";
import { Text } from "./Text";

export function Loading({ label = "Loading..." }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: space.md }}>
      <ActivityIndicator color={colors.primary} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <Card style={{ alignItems: "flex-start" }}>
      <Text variant="heading" tone="destructive">
        Could not load
      </Text>
      <Text variant="caption" tone="muted">
        {message}
      </Text>
      {onRetry ? <Button title="Retry" variant="outline" size="sm" onPress={onRetry} /> : null}
    </Card>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: space.xl }}>
      <Text variant="heading">{title}</Text>
      {hint ? (
        <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}
