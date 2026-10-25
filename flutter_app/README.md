# WasteLess (Flutter)

Flutter version of the WasteLess mobile app. It talks to the Next.js server's `/api/mobile/*`
REST API (contract: `../docs/mobile-api.md`), the same API the Expo app in `../mobile` uses.

Stack: Material 3, `provider` (ChangeNotifier state), `go_router`, `http`,
`flutter_secure_storage` (JWT), `shared_preferences` (selected outlet), `google_fonts`
(Source Code Pro), `fl_chart` (14-day waste chart), `intl`.

## Run

1. Start the web/API server (port 3100):
   ```sh
   cd frontend && npm run dev
   ```
2. Install packages:
   ```sh
   cd flutter_app
   flutter pub get
   ```
3. Run in Chrome on the same PC:
   ```sh
   flutter run -d chrome --dart-define=API_URL=http://localhost:3100
   ```
   `API_URL` defaults to the hosted server `https://wasteless-web.onrender.com`, so pass
   `--dart-define` whenever you want a local server.
4. Android emulator: the host PC is `10.0.2.2`:
   ```sh
   flutter run --dart-define=API_URL=http://10.0.2.2:3100
   ```
5. Physical phone (USB debugging, or a built APK): use the PC's LAN IP.
   - Run `ipconfig` and take the Wi-Fi adapter's "IPv4 Address", e.g. `192.168.1.23`.
   - Start the server so it listens on the network: `npx next dev -H 0.0.0.0 -p 3100` (from `frontend/`).
   - Allow inbound TCP 3100 in Windows Defender Firewall (for Node.js), and keep phone + PC on the same Wi-Fi.
   ```sh
   flutter run --dart-define=API_URL=http://192.168.1.23:3100
   ```

Demo login: `owner@wasteless.local` / `Password123!` (tap "Use" on the login screen).

## Server URL

The app talks to `https://wasteless-web.onrender.com`. To point a build at another server, pass
`--dart-define=API_URL=...` (e.g. `http://192.168.1.23:3100` for a dev PC on the LAN; cleartext
`http://` is allowed in the Android manifest).

## Android APK

Build (needs the Android SDK + JDK 17; see `flutter doctor`):

```sh
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk` (signed with the debug key, fine for
sideloading, not for the Play Store). A copy is kept at `../ZeroPlate.apk`.

Install on a phone:

- Copy the APK to the phone (USB, Drive, WhatsApp to yourself, etc.) and open it. Android asks to
  allow installs from that app ("Install unknown apps"); allow it and tap Install.
- Or with USB debugging on: `adb install -r build/app/outputs/flutter-apk/app-release.apk`.
- Play Protect may warn about an unknown developer; choose "Install anyway".
- The free Render instance sleeps when idle, so the first sign-in can take ~30-60 s.

## Check

```sh
flutter analyze
flutter test
flutter build web --dart-define=API_URL=http://localhost:3100
flutter build apk --release
```

## Structure

```
lib/
  main.dart            entry: MultiProvider + MaterialApp.router
  config.dart          default API_URL (--dart-define); runtime override saved by ApiClient
  theme.dart           Material 3 light/dark theme, "perpetuity" teal palette, Source Code Pro
  router.dart          go_router: /login redirect, ShellRoute with bottom NavigationBar
  api/api_client.dart  http wrapper: Bearer token, JSON, ApiException, 401 -> logout
  models/              fromJson model classes for every API response
  state/               AuthProvider (token + user), OutletProvider (selected outlet)
  screens/             login, home, prep, kitchen, waste, waste_log, more,
                       alerts, forecasts, donations, assistant
  widgets/             KpiCard, AsyncView (loading/error/retry), EmptyState, CountStepper, format helpers
test/
  models_test.dart        fromJson tests
  login_screen_test.dart  login widget tests (mocked http, server URL saving)
```

Notes

- Prep plans are drafted on the web; the app shows tomorrow's plan and lets OWNER/MANAGER approve a
  DRAFT. LOCKED is shown as approved.
- Kitchen steppers start from the selected shift's saved counts; only changed dishes are sent to
  `kitchen/log`. A locked day is read-only.
- The assistant is single-turn: each question is answered on its own.
