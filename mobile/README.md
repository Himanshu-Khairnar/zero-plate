# WasteLess mobile

Expo (SDK 58) + expo-router + TypeScript app for WasteLess. It talks to the Next.js server's
`/api/mobile/*` routes. The contract is in `../docs/mobile-api.md`.

## Run

1. Start the web/API server from `frontend/` (it listens on port 3100):
   ```sh
   cd frontend && npm run dev
   ```
2. Configure the API URL:
   ```sh
   cd mobile
   cp .env.example .env
   ```
   - Expo web or the iOS simulator on this PC: `EXPO_PUBLIC_API_URL=http://localhost:3100`
   - Android emulator: `http://10.0.2.2:3100`
   - **Physical phone (Expo Go):** use your PC's LAN IP, e.g. `http://192.168.1.23:3100`.
     Run `ipconfig` and use the Wi-Fi adapter's "IPv4 Address". The phone and PC must be on the same
     network, and Windows Firewall must allow inbound TCP 3100 (for Node).
   Restart `npx expo start` after changing `.env`.
3. Install and start:
   ```sh
   npm install
   npx expo start
   ```
   Scan the QR code with **Expo Go** (Android) or the Camera app (iOS), or press `w` for web.
   If the phone can't reach Metro, try `npx expo start --tunnel`.

Demo login: `owner@wasteless.local` / `Password123!` (tap the hint on the login screen to fill it).

## Scripts

| Command | What it does |
| --- | --- |
| `npx expo start` | Dev server (Expo Go / web) |
| `npx tsc --noEmit` | Typecheck |
| `npx expo export --platform web` | Static web build into `dist/` |
| `npx expo-doctor` | Dependency/config checks |

## Structure

```
src/
  app/                    expo-router routes
    _layout.tsx           fonts, React Query, auth provider, protected stacks
    (auth)/login.tsx
    (app)/_layout.tsx     outlet provider + stack (modal waste form, More sub-screens)
    (app)/(tabs)/         index (Home), prep, kitchen, waste, more
    (app)/waste-log.tsx, alerts.tsx, forecasts.tsx, donations.tsx, assistant.tsx
  api/                    client.ts (fetch + bearer token + 401 → logout), types.ts, hooks.ts (React Query)
  context/                auth.tsx (session), outlet.tsx (selected outlet → outletId for every call)
  components/             Screen, Card, Button, Stat, Text, Input/Chip/Badge, Loading/Error/Empty
  lib/                    storage (SecureStore, localStorage on web), format, notify
  theme.ts                "perpetuity" palette (light/dark) from frontend/src/app/globals.css
```

## Notes

- The token is stored in `expo-secure-store` on iOS/Android and `localStorage` on web.
- Any 401 from an authenticated call logs out. 403/409 errors show the server's message.
- Kitchen: the API returns day totals (lunch + dinner) and `kitchen/log` upserts one shift's row, so the
  steppers set the **selected shift's** counts (starting from 0, or from what this device last saved for that shift).
  Day totals are shown under each dish.
- Prep shows tomorrow's plan (server default). Plans are drafted on the web; mobile only views and approves.
