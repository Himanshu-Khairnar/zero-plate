import { useColorScheme } from "react-native";

/**
 * Design tokens mirroring the web app's "perpetuity" (tweakcn) theme in
 * frontend/src/app/globals.css. The oklch values there were converted to sRGB
 * hex; only this teal palette (plus the theme's own destructive red) is used.
 */
export type Palette = {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  border: string;
  destructive: string;
  destructiveForeground: string;
  /** chart-1 .. chart-5, strongest to lightest */
  chart: [string, string, string, string, string];
};

export const light: Palette = {
  background: "#E8F0F0", // oklch(0.949 0.0085 197)
  foreground: "#0A4A55", // oklch(0.377 0.062 212)
  card: "#F2F7F7",
  primary: "#06858E", // oklch(0.562 0.095 203)
  primaryForeground: "#FFFFFF",
  secondary: "#D9EAEA",
  muted: "#E0EAEA",
  mutedForeground: "#427A7E",
  accent: "#C9E5E7",
  border: "#CDE0E2",
  destructive: "#D13838",
  destructiveForeground: "#FFFFFF",
  chart: ["#06858E", "#1E9EA6", "#37B6BE", "#5DC7CE", "#8AD8DD"],
};

export const dark: Palette = {
  background: "#0A1A20", // oklch(0.207 0.025 224)
  foreground: "#4DE8E8", // oklch(0.852 0.127 195)
  card: "#0C2025",
  primary: "#4DE8E8",
  primaryForeground: "#0A1A20",
  secondary: "#164955",
  muted: "#0F3039",
  mutedForeground: "#36A5A5",
  accent: "#164955",
  border: "#164955",
  destructive: "#E83C3C",
  destructiveForeground: "#F5F5F5",
  chart: ["#4DE8E8", "#36A5A5", "#2D8A8A", "#19595E", "#0E383C"],
};

export const fonts = {
  regular: "SourceCodePro_400Regular",
  medium: "SourceCodePro_500Medium",
  semibold: "SourceCodePro_600SemiBold",
  bold: "SourceCodePro_700Bold",
} as const;

export const radius = { sm: 2, md: 4, lg: 6 } as const; // web --radius is 0.125rem

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const text = { xs: 11, sm: 13, md: 15, lg: 18, xl: 24, xxl: 32 } as const;

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return { colors: isDark ? dark : light, isDark };
}
