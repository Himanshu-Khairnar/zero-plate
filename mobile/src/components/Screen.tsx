import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { space, useTheme } from "@/theme";
import { Text } from "./Text";

type ScreenProps = {
  title?: string;
  subtitle?: string;
  /** Show a back chevron (stack screens). */
  back?: boolean;
  right?: React.ReactNode;
  /** false = render children in a plain flex View (for screens that own their list/keyboard). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function Screen({ title, subtitle, back, right, scroll = true, refreshing = false, onRefresh, contentStyle, children }: ScreenProps) {
  const { colors } = useTheme();

  const header =
    title || back || right ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md }}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/more"))}
          >
            <Ionicons name="chevron-back" size={24} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {title ? (
            <Text variant="title" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  const padding: ViewStyle = { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[padding, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
