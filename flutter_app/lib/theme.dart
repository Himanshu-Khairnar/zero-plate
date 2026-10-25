import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Colours from the web app's "perpetuity" theme (see mobile/src/theme.ts).
class Palette {
  final Color background;
  final Color foreground;
  final Color card;
  final Color primary;
  final Color primaryForeground;
  final Color secondary;
  final Color muted;
  final Color mutedForeground;
  final Color accent;
  final Color border;
  final Color destructive;
  final Color destructiveForeground;
  final List<Color> chart;

  const Palette({
    required this.background,
    required this.foreground,
    required this.card,
    required this.primary,
    required this.primaryForeground,
    required this.secondary,
    required this.muted,
    required this.mutedForeground,
    required this.accent,
    required this.border,
    required this.destructive,
    required this.destructiveForeground,
    required this.chart,
  });
}

const lightPalette = Palette(
  background: Color(0xFFE8F0F0),
  foreground: Color(0xFF0A4A55),
  card: Color(0xFFF2F7F7),
  primary: Color(0xFF06858E),
  primaryForeground: Color(0xFFFFFFFF),
  secondary: Color(0xFFD9EAEA),
  muted: Color(0xFFE0EAEA),
  mutedForeground: Color(0xFF427A7E),
  accent: Color(0xFFC9E5E7),
  border: Color(0xFFCDE0E2),
  destructive: Color(0xFFD13838),
  destructiveForeground: Color(0xFFFFFFFF),
  chart: [
    Color(0xFF06858E),
    Color(0xFF1E9EA6),
    Color(0xFF37B6BE),
    Color(0xFF5DC7CE),
    Color(0xFF8AD8DD),
  ],
);

const darkPalette = Palette(
  background: Color(0xFF0A1A20),
  foreground: Color(0xFF4DE8E8),
  card: Color(0xFF0C2025),
  primary: Color(0xFF4DE8E8),
  primaryForeground: Color(0xFF0A1A20),
  secondary: Color(0xFF164955),
  muted: Color(0xFF0F3039),
  mutedForeground: Color(0xFF36A5A5),
  accent: Color(0xFF164955),
  border: Color(0xFF164955),
  destructive: Color(0xFFE83C3C),
  destructiveForeground: Color(0xFFF5F5F5),
  chart: [
    Color(0xFF4DE8E8),
    Color(0xFF36A5A5),
    Color(0xFF2D8A8A),
    Color(0xFF19595E),
    Color(0xFF0E383C),
  ],
);

/// Returns the palette for the current brightness.
Palette paletteOf(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? darkPalette : lightPalette;

ThemeData buildTheme(Brightness brightness, {bool useGoogleFonts = true}) {
  final p = brightness == Brightness.dark ? darkPalette : lightPalette;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: p.primary,
    onPrimary: p.primaryForeground,
    secondary: p.secondary,
    onSecondary: p.foreground,
    tertiary: p.chart[2],
    onTertiary: p.primaryForeground,
    error: p.destructive,
    onError: p.destructiveForeground,
    surface: p.background,
    onSurface: p.foreground,
    onSurfaceVariant: p.mutedForeground,
    surfaceContainerLowest: p.card,
    surfaceContainerLow: p.card,
    surfaceContainer: p.card,
    surfaceContainerHigh: p.muted,
    surfaceContainerHighest: p.muted,
    primaryContainer: p.accent,
    onPrimaryContainer: p.foreground,
    secondaryContainer: p.accent,
    onSecondaryContainer: p.foreground,
    outline: p.border,
    outlineVariant: p.border,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: p.background,
  );
  final textTheme = useGoogleFonts ? _sourceCodePro(base.textTheme) : base.textTheme;

  const shape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(4)),
  );

  return base.copyWith(
    textTheme: textTheme.apply(bodyColor: p.foreground, displayColor: p.foreground),
    appBarTheme: AppBarTheme(
      backgroundColor: p.background,
      foregroundColor: p.foreground,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      color: p.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(6)),
        side: BorderSide(color: p.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(shape: shape, minimumSize: const Size(48, 48)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(shape: shape),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: const OutlineInputBorder(),
      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: p.border)),
      filled: true,
      fillColor: p.card,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.card,
      indicatorColor: p.accent,
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

/// Applies Source Code Pro to every style of [t]. (google_fonts 9 builds its
/// own TextTheme helper on package:material_ui, so the styles are mapped here.)
TextTheme _sourceCodePro(TextTheme t) {
  TextStyle? f(TextStyle? s) => s == null ? null : GoogleFonts.sourceCodePro(textStyle: s);
  return TextTheme(
    displayLarge: f(t.displayLarge),
    displayMedium: f(t.displayMedium),
    displaySmall: f(t.displaySmall),
    headlineLarge: f(t.headlineLarge),
    headlineMedium: f(t.headlineMedium),
    headlineSmall: f(t.headlineSmall),
    titleLarge: f(t.titleLarge),
    titleMedium: f(t.titleMedium),
    titleSmall: f(t.titleSmall),
    bodyLarge: f(t.bodyLarge),
    bodyMedium: f(t.bodyMedium),
    bodySmall: f(t.bodySmall),
    labelLarge: f(t.labelLarge),
    labelMedium: f(t.labelMedium),
    labelSmall: f(t.labelSmall),
  );
}
