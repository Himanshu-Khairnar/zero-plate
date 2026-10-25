import { View } from "react-native";

import { useDonations } from "@/api/hooks";
import { Badge, Card, Divider, Empty, ErrorState, Loading, Screen, Stat, Text } from "@/components";
import { useOutlet } from "@/context/outlet";
import { humanize, num, shortDate } from "@/lib/format";
import { space } from "@/theme";

export default function DonationsScreen() {
  const { outlet } = useOutlet();
  const q = useDonations();

  return (
    <Screen title="Donations" subtitle={outlet.name} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Stat label="Meals donated" value={num(q.data.mealsDonated)} hint="all time, collected" />
          {q.data.items.length === 0 ? (
            <Empty title="No donations yet" hint="Schedule surplus pickups from the web app." />
          ) : (
            <Card title="Recent">
              {q.data.items.map((d, i) => (
                <View key={d.id} style={{ gap: space.md }}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1}>{d.ngoName ?? "Unassigned NGO"}</Text>
                      <Text variant="caption" tone="muted">
                        {shortDate(d.date)} · {num(d.meals)} meals
                      </Text>
                    </View>
                    <Badge label={humanize(d.status)} tone={d.status === "COLLECTED" ? "primary" : d.status === "CANCELLED" ? "destructive" : "muted"} />
                  </View>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
