import type { Ref } from "react";
import { Pressable, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";

import { fonts, radius, space, text, useTheme } from "@/theme";
import { Text } from "./Text";

/** Themed single-line input with optional label. */
export function Input({ label, style, ref, ...rest }: Omit<TextInputProps, "ref"> & { label?: string; ref?: Ref<TextInputInstance> }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.mutedForeground}
        {...rest}
        style={[
          {
            minHeight: 46,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            color: colors.foreground,
            fontFamily: fonts.regular,
            fontSize: text.md,
          },
          style,
        ]}
      />
    </View>
  );
}

/** Pill used for single-choice pickers (shift, reason, dish...). */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.card,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text variant="caption" weight={selected ? "semibold" : "medium"} tone={selected ? "inverse" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Small status tag. */
export function Badge({ label, tone = "muted" }: { label: string; tone?: "muted" | "primary" | "destructive" }) {
  const { colors } = useTheme();
  const bg = { muted: colors.secondary, primary: colors.primary, destructive: colors.destructive }[tone];
  const fg = { muted: colors.foreground, primary: colors.primaryForeground, destructive: colors.destructiveForeground }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text variant="label" style={{ color: fg, fontSize: 10 }}>
        {label}
      </Text>
    </View>
  );
}

/** Thin horizontal rule between list rows. */
export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}
