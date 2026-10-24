# WasteLess mobile API (v1)

REST API served by the Next.js app under `/api/mobile/*` for the Expo app in `mobile/`.
The web frontend is unchanged; these routes reuse the same Prisma models and `src/lib/*` helpers.

## Auth

- `POST /api/mobile/auth/login` body `{ email, password }` →
  `{ token, user: { id, name, email, role, organizationName }, outlets: [{ id, name }] }`
  - `token` is an HS256 JWT signed with `AUTH_SECRET`, 30 day expiry, claims `{ sub: userId, role, orgId }`.
- Every other route requires `Authorization: Bearer <token>`; 401 `{ error }` otherwise.
- Routes scoped to an outlet take `?outletId=` (defaults to the user's first outlet). The server must
  check the user may access that outlet (403 otherwise).
- Errors: `{ error: string }` with a 4xx/5xx status.

## Endpoints

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/mobile/me` | `{ user, outlets }` (same shape as login) |
| GET | `/api/mobile/dashboard?outletId=` | `{ date, kpis: { forecastCovers, wasteKg, wasteValue, revenue, accuracyPct, mealsDonated }, alertsOpen, prepStatus: "NONE"\|"DRAFT"\|"APPROVED", wasteTrend: [{ date, wasteKg }] (last 14 days) }` |
| GET | `/api/mobile/forecasts?outletId=&days=7` | `{ days: [{ date, items: [{ dishId, dishName, low, likely, high }] }] }` |
| GET | `/api/mobile/prep-plan?outletId=&date=YYYY-MM-DD` | `{ plan: null \| { id, date, status, items: [{ id, dishId, dishName, forecastQty, plannedQty, unit }] } }` |
| POST | `/api/mobile/prep-plan/:id/approve` | `{ ok: true }` — OWNER/MANAGER only (403 otherwise) |
| GET | `/api/mobile/kitchen?outletId=&date=` | `{ date, locked, dishes: [{ dishId, dishName, target, prepared, sold, leftover }] }` |
| POST | `/api/mobile/kitchen/log` body `{ outletId, dishId, shift, prepared, sold }` | `{ ok: true }` |
| GET | `/api/mobile/waste?outletId=&limit=30` | `{ items: [{ id, date, dishName \| ingredientName, qty, unit, reason, value }] }` |
| POST | `/api/mobile/waste` body `{ outletId, dishId?, ingredientId?, qty, unit, reason, note? }` | `{ ok: true, id }` |
| GET | `/api/mobile/waste/options?outletId=` | `{ dishes: [{ id, name }], ingredients: [{ id, name, unit }], reasons: string[] }` |
| GET | `/api/mobile/alerts?outletId=` | `{ items: [{ id, type, severity, title, message, createdAt, read }] }` |
| POST | `/api/mobile/alerts/:id/read` | `{ ok: true }` |
| GET | `/api/mobile/donations?outletId=` | `{ mealsDonated, items: [{ id, date, ngoName, meals, status }] }` |
| POST | `/api/mobile/assistant` body `{ outletId, message }` | `{ reply }` |

Field names follow the Prisma schema where one exists; `shift` and `reason` use the Prisma enum values.
CORS: allow any origin with `Authorization, Content-Type` headers (Expo web / dev), and answer `OPTIONS`.

## Implementation notes (server)

Shapes above are unchanged; these pin down values the table leaves open.

- Login/me: `organizationName` is `null` for platform admins. `outlets` is every outlet the user may see
  (owners: whole org; staff/managers: assigned outlets, else the org's; admins: all).
- No `outletId` and no outlets on the account → 404. An `outletId` the user may not see → 403.
- The user row is re-read on every request, so a deleted account gets 401 and role changes apply at once.
- `dashboard`: `date` is today. `forecastCovers` = today's forecast (likely, summed). `wasteKg`/`wasteValue`
  cover the last 30 days including today (dish rows ≈ 0.35 kg per plate; ingredient rows by unit, `pcs` = 0).
  `revenue` = last 30 days up to yesterday. `accuracyPct` = 100 − MAPE over 28 days and is **`null` when there
  is no forecast/actual overlap yet**. `mealsDonated` = collected this month. `prepStatus` is for **tomorrow's**
  plan (LOCKED counts as APPROVED). `wasteTrend` has exactly 14 entries, oldest first, zero-filled.
- `forecasts`: starts today; `days` is clamped to 1–14; every day is present (possibly with `items: []`);
  low/likely/high are rounded to whole plates; inactive dishes are left out.
- `prep-plan`: `date` defaults to tomorrow. Read-only: returns `{ plan: null }` if none exists (drafting stays on
  the web). `status` is `DRAFT | APPROVED | LOCKED`; `forecastQty` = rounded likely forecast; `unit` = `"plates"`.
  Approving a LOCKED plan → 409.
- `kitchen`: `date` defaults to today (UTC, as web kitchen mode). Counts are summed over LUNCH + DINNER;
  `target` is the approved plan's quantity for that date, else the dish's prep target; `leftover` = max(0, prepared − sold).
  Each dish also has `shifts: { LUNCH: { prepared, sold }, DINNER: { prepared, sold } }` (that shift's own row, 0 if none).
- `kitchen/log`: writes today's row for that dish/shift (upsert). Roles OWNER/MANAGER/KITCHEN_STAFF. Locked day → 409.
- `waste` GET: each item has both `dishName` and `ingredientName`, one of them `null`. `unit` is `"plates"` for dishes,
  else the ingredient's unit. `value` is ₹ (recipe cost × qty), rounded. `limit` is clamped to 1–200.
- `waste` POST: logged for today; `unit` is accepted but ignored (implied by the dish/ingredient).
  `reason` ∈ `overproduction | spoilage | plate_waste | prep_loss`. Dish/ingredient not in the outlet → 404.
- `alerts`: latest 100, newest first. `title` comes from the type (e.g. "Low stock"); `severity` ∈ `info | warning | critical`.
- `donations`: `mealsDonated` = all-time collected meals; `items` = latest 50; `ngoName` may be `null`;
  `status` ∈ `PLANNED | COLLECTED | CANCELLED`.
- `assistant`: single turn (no history); uses Claude when `ANTHROPIC_API_KEY` is set, else the offline rule-based answers.
