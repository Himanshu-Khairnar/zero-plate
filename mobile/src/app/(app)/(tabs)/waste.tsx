import { router } from "expo-router";
import { View } from "react-native";

import { useWaste } from "@/api/hooks";
import { Button, Card, Divider, Empty, ErrorState, Loading, Screen, Text } from "@/components";
import { useOutlet } from "@/context/outlet";
import { humanize, money, num, shortDate } from "@/lib/format";
import { space } from "@/theme";

export default function WasteScreen() {
  const { outlet } = useOutlet();
  const q = useWaste(30);
  const items = q.data?.items ?? [];
  const totalValue = items.reduce((s, i) => s + (i.value ?? 0), 0);

  return (
    <Screen title="Waste" subtitle={outlet.name} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Button title="+ Log waste" size="lg" onPress={() => router.push("/waste-log")} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty title="No waste logged" hint="Entries you log show up here." />
      ) : (
        <Card title={`Recent · ${items.length}`} right={<Text variant="caption" tone="muted">{money(totalValue)}</Text>}>
          {items.map((w, i) => (
            <View key={w.id} style={{ gap: space.md }}>
              {i > 0 ? <Divider /> : null}
              <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1}>{w.dishName ?? w.ingredientName ?? "Unknown item"}</Text>
                  <Text variant="caption" tone="muted">
                    {shortDate(w.date)} · {humanize(w.reason)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text weight="semibold">
                    {num(w.qty, 2)} {w.unit}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {money(w.value)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
