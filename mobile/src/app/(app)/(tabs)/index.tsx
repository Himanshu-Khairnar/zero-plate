import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { useDashboard } from "@/api/hooks";
import type { DashboardResponse, PrepStatus } from "@/api/types";
import { Badge, Card, ErrorState, Loading, Screen, Stat, Text } from "@/components";
import { useSession } from "@/context/auth";
import { useOutlet } from "@/context/outlet";
import { dayOfMonth, money, num, shortDate } from "@/lib/format";
import { radius, space, useTheme } from "@/theme";

export default function HomeScreen() {
  const { user } = useSession();
  const { outlet } = useOutlet();
  const q = useDashboard();

  return (
    <Screen
      title={`Hi, ${user.name.split(" ")[0] || "there"}`}
      subtitle={`${outlet.name} · ${q.data ? shortDate(q.data.date) : (user.organizationName ?? "WasteLess")}`}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Dashboard data={q.data} />
      )}
    </Screen>
  );
}

function Dashboard({ data }: { data: DashboardResponse }) {
  const { kpis } = data;
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Stat label="Forecast covers" value={num(kpis.forecastCovers)} hint="today, forecast" />
        <Stat label="Accuracy" value={kpis.accuracyPct == null ? "—" : `${num(kpis.accuracyPct, 1)}%`} hint={kpis.accuracyPct == null ? "not enough data" : "28-day, vs sold"} />
        <Stat label="Waste · 30d" value={`${num(kpis.wasteKg, 1)} kg`} hint={money(kpis.wasteValue)} />
        <Stat label="Revenue · 30d" value={money(kpis.revenue)} />
        <Stat label="Meals donated" value={num(kpis.mealsDonated)} hint="this month" style={{ flexBasis: "100%" }} />
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <LinkTile
          label="Open alerts"
          value={num(data.alertsOpen)}
          icon="notifications-outline"
          emphasis={data.alertsOpen > 0}
          onPress={() => router.push("/alerts")}
        />
        <PrepTile status={data.prepStatus} />
      </View>

      <WasteTrend points={data.wasteTrend} />
    </>
  );
}

function LinkTile({
  label,
  value,
  icon,
  emphasis,
  onPress,
  children,
}: {
  label: string;
  value?: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  emphasis?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}>
      <Card style={{ flex: 1, gap: space.sm, borderColor: emphasis ? colors.primary : colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="label" tone="muted">
            {label}
          </Text>
          <Ionicons name={icon} size={16} color={colors.mutedForeground} />
        </View>
        {value !== undefined ? <Text variant="value">{value}</Text> : null}
        {children}
      </Card>
    </Pressable>
  );
}

const PREP_COPY: Record<PrepStatus, { label: string; tone: "muted" | "primary" | "destructive"; hint: string }> = {
  NONE: { label: "Not drafted", tone: "destructive", hint: "No plan for tomorrow" },
  DRAFT: { label: "Draft", tone: "muted", hint: "Tomorrow, awaiting approval" },
  APPROVED: { label: "Approved", tone: "primary", hint: "Tomorrow is set" },
};

function PrepTile({ status }: { status: PrepStatus }) {
  const copy = PREP_COPY[status] ?? PREP_COPY.NONE;
  return (
    <LinkTile label="Prep plan" icon="clipboard-outline" emphasis={status === "DRAFT"} onPress={() => router.push("/prep")}>
      <Badge label={copy.label} tone={copy.tone} />
      <Text variant="caption" tone="muted">
        {copy.hint}
      </Text>
    </LinkTile>
  );
}

const CHART_HEIGHT = 120;

/** 14-day waste bars drawn with plain Views (no chart library). */
function WasteTrend({ points }: { points: DashboardResponse["wasteTrend"] }) {
  const { colors } = useTheme();
  const max = Math.max(0, ...points.map((p) => p.wasteKg));
  const total = points.reduce((s, p) => s + p.wasteKg, 0);
  const avg = points.length ? total / points.length : 0;

  return (
    <Card title="Waste trend · 14 days" right={<Text variant="caption" tone="muted">avg {num(avg, 1)} kg/day</Text>}>
      {points.length === 0 ? (
        <Text variant="caption" tone="muted">
          No waste logged yet.
        </Text>
      ) : (
        <View>
          <View style={{ height: CHART_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
            {points.map((p, i) => {
              const h = max > 0 ? Math.max(2, (p.wasteKg / max) * CHART_HEIGHT) : 2;
              const isLast = i === points.length - 1;
              return (
                <View
                  key={p.date}
                  accessibilityLabel={`${shortDate(p.date)}: ${num(p.wasteKg, 1)} kg`}
                  style={{
                    flex: 1,
                    height: h,
                    borderTopLeftRadius: radius.sm,
                    borderTopRightRadius: radius.sm,
                    backgroundColor: isLast ? colors.primary : p.wasteKg > avg ? colors.chart[2] : colors.chart[4],
                  }}
                />
              );
            })}
          </View>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
            {points.map((p, i) => (
              <Text key={p.date} variant="caption" tone="muted" style={{ flex: 1, textAlign: "center", fontSize: 9 }}>
                {(points.length - 1 - i) % 2 === 0 ? dayOfMonth(p.date) : ""}
              </Text>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}
