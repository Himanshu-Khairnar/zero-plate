# WasteLess — Frontend

Next.js frontend for **WasteLess** (Zero Plate), a multi-tenant restaurant
waste-management platform: forecasting, prep planning, kitchen operations, and
waste analytics.

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, `cacheComponents`)
- **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (base-nova style) + **Lucide** icons
- **Auth.js v5** (`next-auth`) with the **Prisma adapter** (Credentials + JWT sessions)
- **Prisma 6** + PostgreSQL
- **Zod** for validation, **bcryptjs** for password hashing, **tsx** to run the seed

## Getting started

```bash
cd frontend
npm install
cp .env.example .env.local
npx prisma migrate dev --name init   # or: npx prisma db push
npx prisma db seed
npm run dev                          # http://localhost:3000
```

Environment variables (see `.env.example`):

| Variable              | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string             |
| `AUTH_SECRET`         | Auth.js session encryption secret        |
| `NEXT_PUBLIC_API_URL` | FastAPI backend base URL                 |

## Demo accounts

All seeded users use the password `Password123!`.

| Email                    | Role            | Notes                    |
| ------------------------ | --------------- | ------------------------ |
| `owner@wasteless.local`  | OWNER           | Spice Garden Group       |
| `manager@wasteless.local`| MANAGER         | Spice Garden Group       |
| `kitchen@wasteless.local`| KITCHEN_STAFF   | Assigned to Bandra Branch|
| `admin@wasteless.local`  | PLATFORM_ADMIN  | Cross-tenant             |

## Authentication & roles

- Auth.js v5 with a `Credentials` provider and `PrismaAdapter`; the JWT callback
  attaches `id`, `role`, and `organizationId` to the session.
- `src/middleware.ts` guards routes with `auth()`:
  - `/dashboard/*`, `/kitchen/*`, `/admin/*`, `/settings/*` require a session
    (unauthenticated visitors are redirected to `/login?callbackUrl=…`).
  - `/admin/*` requires `PLATFORM_ADMIN`; `/settings/*` requires `OWNER`;
    `/kitchen/*` allows `KITCHEN_STAFF`, `MANAGER`, and `OWNER`.
  - Authenticated users hitting `/login` or `/register` are redirected to their
    role home (`/kitchen` for kitchen staff, `/dashboard` otherwise).
- The root page (`/`) redirects based on session and role.

## Modules

- **Module A — Auth & Multi-Tenancy**: `Organization`, `Outlet`, `User`,
  `UserOutlet`, plus Auth.js models. Registration onboarding creates an
  organization, a default outlet, and an `OWNER` user in one transaction.
- **Staff invitations**: owners/managers generate a 48-hour token link
  (`/accept-invite?token=…`); the invitee sets a name and password and is scoped
  to the organization/outlet.
- **Dashboard**: role-adaptive shell (sidebar + top header) and per-role home
  views (OWNER, MANAGER, KITCHEN_STAFF, PLATFORM_ADMIN).
- **Module G — Kitchen Mode** (`/kitchen`): touch-friendly shift logging
  (LUNCH/DINNER) with per-dish prepared/sold steppers, leftover calculation, and
  an end-of-day closing checklist that locks the day (`isLocked`).

## Scripts

| Command                  | Description                          |
| ------------------------ | ------------------------------------ |
| `npm run dev`            | Start the dev server                 |
| `npm run build`          | Production build                     |
| `npm run start`          | Start the production server          |
| `npm run lint`           | ESLint                               |
| `npx tsc --noEmit`       | Type-check                           |
| `npx prisma migrate dev` | Apply schema migrations              |
| `npx prisma db seed`     | Seed demo data (via `tsx`)           |
| `npx prisma studio`      | Browse the database                  |

## Project layout

```
prisma/                     schema.prisma, seed.ts
src/
  actions/                  Server Actions (auth, invite-staff, kitchen)
  app/
    (auth)/                 login, register, accept-invite
    (dashboard)/            dashboard shell + dashboard/, kitchen/
    api/auth/[...nextauth]/ Auth.js route handler
  components/
    auth/                   auth forms
    dashboard/              shell, nav, KPI cards, role views, kitchen/*
    ui/                     shadcn/ui primitives
  lib/                      prisma client, date helpers, utils
  auth.ts / auth.config.ts  Auth.js setup
  middleware.ts             route guarding + RBAC
```

## Changelog

### Module G — Kitchen Mode & daily operations

- Added `Shift` enum plus `Dish` and `KitchenLog` models (unique per
  dish/outlet/date/shift, `isLocked` flag) and sample dishes to the seed.
- Added `src/actions/kitchen.ts`: `getTodayKitchenData`, `saveKitchenShiftLog`,
  and `closeAndLockDay` (role- and organization-scoped, blocked once locked).
- Added the `/kitchen` tablet UI: shift toggle, high-contrast dish cards with
  `-` / `+` / `+5` steppers, leftover counts, and a sticky end-of-day closing
  checklist modal that locks the day.

### Dashboard — streaming fix & UI refresh

- Fixed the Cache Components blocking-render error by moving the session read
  out of the `(dashboard)` layout's top level into a `<Suspense>` boundary
  (`dashboard-layout-content.tsx`), with skeleton fallbacks
  (`dashboard-loading.tsx`, `(dashboard)/loading.tsx`). Redirect-only and
  `searchParams` pages opt out via `export const instant = false`.
- Refreshed the dashboard shell (gradient brand mark, grouped nav, user chip,
  sticky header) and KPI cards (icon tones + trend pills), and restyled the
  OWNER, MANAGER, and PLATFORM_ADMIN home views.
