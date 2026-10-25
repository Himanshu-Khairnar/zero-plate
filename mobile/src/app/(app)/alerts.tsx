import { View } from "react-native";

import { useAlerts, useMarkAlertRead } from "@/api/hooks";
import { Badge, Button, Card, Empty, ErrorState, Loading, Screen, Text } from "@/components";
import { useOutlet } from "@/context/outlet";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { space, useTheme } from "@/theme";

export default function AlertsScreen() {
  const { outlet } = useOutlet();
  const { colors } = useTheme();
  const q = useAlerts();
  const markRead = useMarkAlertRead();
  const items = q.data?.items ?? [];
  const unread = items.filter((a) => !a.read).length;

  return (
    <Screen title="Alerts" subtitle={`${outlet.name} · ${unread} unread`} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty title="All clear" hint="No alerts for this outlet." />
      ) : (
        items.map((a) => (
          <Card key={a.id} style={{ opacity: a.read ? 0.65 : 1, borderColor: !a.read && a.severity === "critical" ? colors.destructive : colors.border }}>
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <Badge label={a.severity} tone={a.severity === "critical" ? "destructive" : a.severity === "warning" ? "primary" : "muted"} />
              <Text variant="caption" tone="muted" style={{ flex: 1, textAlign: "right" }}>
                {dateTime(a.createdAt)}
              </Text>
            </View>
            <Text variant="heading">{a.title}</Text>
            <Text variant="caption">{a.message}</Text>
            {!a.read ? (
              <Button
                title="Mark read"
                variant="outline"
                size="sm"
                style={{ alignSelf: "flex-start" }}
                loading={markRead.isPending && markRead.variables === a.id}
                onPress={() =>
                  markRead.mutate(a.id, { onError: (e) => notify("Could not update", e instanceof Error ? e.message : "Try again.") })
                }
              />
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
