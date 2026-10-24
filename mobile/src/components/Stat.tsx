import { View, type StyleProp, type ViewStyle } from "react-native";

import { radius, space, useTheme } from "@/theme";
import { Text } from "./Text";

type StatProps = { label: string; value: string; hint?: string; style?: StyleProp<ViewStyle> };

/** KPI tile: small uppercase label, large monospace value, optional hint. */
export function Stat({ label, value, hint, style }: StatProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexGrow: 1,
          flexBasis: "45%",
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: space.md,
          gap: space.xs,
        },
        style,
      ]}
    >
      <Text variant="label" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="value" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
