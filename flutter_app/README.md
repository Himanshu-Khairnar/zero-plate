# WasteLess (Flutter)

Flutter version of the WasteLess mobile app. It talks to the Next.js server's `/api/mobile/*`
REST API (contract: `../docs/mobile-api.md`), the same API the Expo app in `../mobile` uses.

Stack: Material 3, `provider` (ChangeNotifier state), `go_router`, `http`,
`flutter_secure_storage` (JWT), `shared_preferences` (selected outlet), `google_fonts`
(Source Code Pro), `fl_chart` (charts), `intl`, `image_picker` (waste photos), `http_parser`
(multipart content type).

## Features

Role-aware: actions an account's role cannot do are hidden (the server still enforces them).
"Managers" below means OWNER and MANAGER.

- **Home**: today's KPIs, open alerts, tomorrow's plan status, 14-day waste chart.
- **Prep**: full plan for any day (date picker, default tomorrow): low/likely/high, risk badge,
  suggested vs planned, model explanation, ingredient roll-up, totals, adjustment log.
  Managers: "Generate draft" when there is no plan, "Re-forecast" a draft, tap a dish to change its
  planned plates with a reason, approve / re-approve with optional notes. LOCKED plans are read-only.
- **Kitchen**: per-shift prepared/sold steppers; "Log leftovers as waste" (everyone);
  "Close & lock day" (managers, with a confirm dialog).
- **Waste**: recent entries and the log form; camera/gallery photo -> recognition suggestions
  (dish, estimated plates, confidence, model note) -> tap one to prefill the form. Managers delete
  an entry by swiping left or long-pressing (confirmed).
- **More**
  - Alerts: mark one / all read; managers can run the anomaly scan.
  - Forecasts: next 7 days by dish.
  - Donations: tonight's suggested surplus (one tap to donate it), "New donation" (NGO, day,
    meals, dishes, note), change status Planned / Collected / Cancelled per entry.
  - Analytics: sales line, forecast vs actual with the low-high band, waste by reason, money saved,
    "why tomorrow" explanations (14/30/60/90 days).
  - Waste heatmap: dish x weekday grid, last 8 weeks, in the theme's teal shades.
  - Inventory: stock with OK/LOW/OUT and expiry badges, suggested purchase orders (read-only).
  - What-if: rain, max temperature, discount, holiday and dish subset -> baseline vs scenario totals
    and a per-dish table.
  - AI Assistant: single-turn questions.
  - Invite staff (managers): email, role, outlets -> invitation link with a copy button.

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
  screens/             login, home, prep, kitchen, waste, waste_log, more, alerts, forecasts,
                       donations, assistant, analytics, heatmap, inventory, whatif, invite
  widgets/             KpiCard, AsyncView (loading/error/retry), EmptyState, CountStepper,
                       SectionCard/Tag, confirm dialog, format helpers
test/
  models_test.dart          fromJson tests (v1 endpoints)
  models_v2_test.dart       fromJson tests (v2 endpoints: PlanView, stock, analytics, what-if, vision...)
  login_screen_test.dart    login widget tests (mocked http)
  prep_screen_test.dart     prep plan view, generate, adjust, role visibility
  role_visibility_test.dart kitchen lock, waste delete, alert scan, invite hidden for KITCHEN_STAFF
  waste_prefill_test.dart   photo suggestion -> waste form prefill
  helpers.dart              pumpScreen() with a mocked server
```

Notes

- The camera uses the system camera app via image_picker, so the app declares no CAMERA permission
  (only a `<queries>` entry for the capture intent). Photos are downscaled to 1600 px JPEG before
  upload (server limit 5 MB).

- Kitchen steppers start from the selected shift's saved counts; only changed dishes are sent to
  `kitchen/log`. A locked day is read-only.
- The assistant is single-turn: each question is answered on its own.
