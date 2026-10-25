/// App configuration.
///
/// Default API base URL. Override at build time with
///   flutter run --dart-define=API_URL=http://192.168.1.10:3100
/// or at runtime from the login screen (Server field), which is saved on the
/// device and wins over this value.
///
/// Defaults to the hosted deployment. For a local server use
/// http://localhost:3100 (Chrome / desktop), http://10.0.2.2:3100 (Android
/// emulator) or your computer's LAN IP (real phone).
class AppConfig {
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://wasteless-web.onrender.com',
  );

  static const String demoEmail = 'owner@wasteless.local';
  static const String demoPassword = 'Password123!';
}
