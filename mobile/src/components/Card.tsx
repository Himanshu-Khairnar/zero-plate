import { View, type ViewProps } from "react-native";

import { radius, space, useTheme } from "@/theme";
import { Text } from "./Text";

type CardProps = ViewProps & { title?: string; right?: React.ReactNode; padded?: boolean };

export function Card({ title, right, padded = true, style, children, ...rest }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: padded ? space.lg : 0,
          gap: space.md,
        },
        style,
      ]}
    >
      {(title || right) && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          {title ? (
            <Text variant="label" tone="muted" style={{ flexShrink: 1 }}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}
