import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { radius, space, useTheme } from "@/theme";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";

type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, variant = "primary", size = "md", loading, disabled, icon, style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
    secondary: { bg: colors.secondary, fg: colors.foreground, border: colors.secondary },
    outline: { bg: "transparent", fg: colors.foreground, border: colors.border },
    ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive },
  };
  const p = palette[variant];
  const height = { sm: 34, md: 44, lg: 52 }[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      {...rest}
      style={({ pressed }) => [
        {
          minHeight: height,
          paddingHorizontal: size === "sm" ? space.md : space.lg,
          borderRadius: radius.md,
          backgroundColor: p.bg,
          borderWidth: 1,
          borderColor: p.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {loading ? <ActivityIndicator size="small" color={p.fg} /> : icon}
        <Text weight="semibold" style={{ color: p.fg, fontSize: size === "sm" ? 13 : 15 }}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}
