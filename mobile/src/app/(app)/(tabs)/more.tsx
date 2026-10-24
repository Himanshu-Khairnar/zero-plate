import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { API_URL } from "@/api/client";
import { Button, Card, Chip, Divider, Screen, Text } from "@/components";
import { useSession } from "@/context/auth";
import { useOutlet } from "@/context/outlet";
import { humanize } from "@/lib/format";
import { confirm } from "@/lib/notify";
import { space, useTheme } from "@/theme";

const LINKS: { href: Href; title: string; hint: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { href: "/alerts", title: "Alerts", hint: "Stock, waste and forecast warnings", icon: "notifications-outline" },
  { href: "/forecasts", title: "Forecasts", hint: "Next 7 days by dish", icon: "trending-up-outline" },
  { href: "/donations", title: "Donations", hint: "Surplus meals sent to NGOs", icon: "heart-outline" },
  { href: "/assistant", title: "AI Assistant", hint: "Ask about waste, prep and sales", icon: "chatbubbles-outline" },
];

export default function MoreScreen() {
  const { user, logout } = useSession();
  const { outlets, outletId, setOutletId } = useOutlet();
  const { colors } = useTheme();

  return (
    <Screen title="More" subtitle={user.organizationName ?? "WasteLess"}>
      <Card padded={false} style={{ gap: 0 }}>
        {LINKS.map((l, i) => (
          <View key={l.title}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(l.href)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name={l.icon} size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text weight="semibold">{l.title}</Text>
                <Text variant="caption" tone="muted">
                  {l.hint}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
      </Card>

      <Card title="Outlet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {outlets.map((o) => (
            <Chip key={o.id} label={o.name} selected={o.id === outletId} onPress={() => setOutletId(o.id)} />
          ))}
        </View>
      </Card>

      <Card title="Account">
        <View style={{ gap: 2 }}>
          <Text weight="semibold">{user.name}</Text>
          <Text variant="caption" tone="muted">
            {user.email} · {humanize(user.role)}
          </Text>
        </View>
        <Button
          title="Log out"
          variant="outline"
          onPress={async () => {
            if (await confirm("Log out?", "You will need to sign in again.", "Log out")) void logout();
          }}
        />
      </Card>

      <Text variant="caption" tone="muted" style={{ textAlign: "center", fontSize: 11 }}>
        Server: {API_URL}
      </Text>
    </Screen>
  );
}
