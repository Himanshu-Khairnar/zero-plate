import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router/js-tabs";

import { fonts, useTheme } from "@/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: "index", title: "Home", icon: "grid-outline", iconActive: "grid" },
  { name: "prep", title: "Prep", icon: "clipboard-outline", iconActive: "clipboard" },
  { name: "kitchen", title: "Kitchen", icon: "restaurant-outline", iconActive: "restaurant" },
  { name: "waste", title: "Waste", icon: "trash-outline", iconActive: "trash" },
  { name: "more", title: "More", icon: "ellipsis-horizontal-circle-outline", iconActive: "ellipsis-horizontal-circle" },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? t.iconActive : t.icon} size={size} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
