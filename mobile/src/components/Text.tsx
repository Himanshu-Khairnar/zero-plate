import { Text as RNText, type TextProps } from "react-native";

import { fonts, text, useTheme } from "@/theme";

type Variant = "title" | "heading" | "body" | "label" | "caption" | "value";
type Tone = "default" | "muted" | "primary" | "destructive" | "inverse";

const variants: Record<Variant, { fontSize: number; fontFamily: string; lineHeight?: number; letterSpacing?: number }> = {
  title: { fontSize: text.xl, fontFamily: fonts.bold, lineHeight: 30 },
  heading: { fontSize: text.lg, fontFamily: fonts.semibold, lineHeight: 24 },
  body: { fontSize: text.md, fontFamily: fonts.regular, lineHeight: 21 },
  label: { fontSize: text.xs, fontFamily: fonts.medium, letterSpacing: 0.8 },
  caption: { fontSize: text.sm, fontFamily: fonts.regular, lineHeight: 18 },
  value: { fontSize: text.xl, fontFamily: fonts.semibold },
};

export type AppTextProps = TextProps & { variant?: Variant; tone?: Tone; weight?: keyof typeof fonts };

export function Text({ variant = "body", tone = "default", weight, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const color = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    primary: colors.primary,
    destructive: colors.destructive,
    inverse: colors.primaryForeground,
  }[tone];
  const v = variants[variant];
  return (
    <RNText
      {...rest}
      style={[
        v,
        { color },
        variant === "label" && { textTransform: "uppercase" },
        weight && { fontFamily: fonts[weight] },
        style,
      ]}
    />
  );
}
