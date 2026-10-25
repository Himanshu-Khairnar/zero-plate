import { View } from "react-native";

import { useForecasts } from "@/api/hooks";
import { Card, Divider, Empty, ErrorState, Loading, Screen, Text } from "@/components";
import { useOutlet } from "@/context/outlet";
import { num, shortDate } from "@/lib/format";
import { radius, space, useTheme } from "@/theme";

export default function ForecastsScreen() {
  const { outlet } = useOutlet();
  const { colors } = useTheme();
  const q = useForecasts(7);
  const days = q.data?.days ?? [];
  const maxHigh = Math.max(1, ...days.flatMap((d) => d.items.map((i) => i.high)));

  return (
    <Screen title="Forecasts" subtitle={`${outlet.name} · next 7 days`} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : days.length === 0 ? (
        <Empty title="No forecasts" hint="Run forecasting from the web app." />
      ) : (
        days.map((d) => {
          const total = d.items.reduce((s, i) => s + i.likely, 0);
          return (
            <Card key={d.date} title={shortDate(d.date)} right={<Text variant="caption" tone="muted">{num(total)} plates</Text>}>
              {d.items.length === 0 ? (
                <Text variant="caption" tone="muted">
                  No forecast for this day.
                </Text>
              ) : (
                d.items.map((i, idx) => (
                  <View key={i.dishId} style={{ gap: space.xs }}>
                    {idx > 0 ? <Divider /> : null}
                    <View style={{ flexDirection: "row", gap: space.sm }}>
                      <Text style={{ flex: 1 }} numberOfLines={1}>
                        {i.dishName}
                      </Text>
                      <Text weight="bold">{num(i.likely)}</Text>
                      <Text variant="caption" tone="muted" style={{ minWidth: 64, textAlign: "right" }}>
                        {num(i.low)}–{num(i.high)}
                      </Text>
                    </View>
                    {/* low..high band with the likely value marked */}
                    <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: radius.sm }}>
                      <View
                        style={{
                          position: "absolute",
                          left: `${(i.low / maxHigh) * 100}%`,
                          width: `${Math.max(1, ((i.high - i.low) / maxHigh) * 100)}%`,
                          top: 0,
                          bottom: 0,
                          backgroundColor: colors.chart[3],
                          borderRadius: radius.sm,
                        }}
                      />
                      <View style={{ position: "absolute", left: `${(i.likely / maxHigh) * 100}%`, width: 3, top: -2, bottom: -2, backgroundColor: colors.primary }} />
                    </View>
                  </View>
                ))
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
