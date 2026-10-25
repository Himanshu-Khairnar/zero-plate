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

## v2 endpoints (mobile feature parity)

Same auth, outlet and error rules as above. Where a response says "= `TypeName`", it is exactly the
JSON of that TypeScript type from the web app (single source of truth, read it there):
`PlanView` (`frontend/src/lib/prep-plans.ts`), `StockRow` / `SuggestedOrder` (`src/lib/stock.ts`),
`SurplusEstimate` (`src/actions/donations.ts`), `VisionResult` (`src/actions/waste.ts`), the what-if
response (`src/app/api/whatif/route.ts`). Roles in brackets; others get 403.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/mobile/prep-plan/full?outletId=&date=` | date defaults to tomorrow | `{ plan: PlanView \| null }` (read-only, never drafts) |
| POST | `/api/mobile/prep-plan/generate` [OWNER, MANAGER] | `{ outletId, date }` | `{ plan: PlanView }` — get-or-create; regenerates if still DRAFT |
| POST | `/api/mobile/prep-plan/:id/adjust` [OWNER, MANAGER] | `{ changes: [{ dishId, plannedQty, reason? }] }` | `{ plan: PlanView }`; LOCKED → 409 |
| POST | `/api/mobile/prep-plan/:id/approve` | (existing) optional `{ notes? }` | `{ ok: true }` |
| POST | `/api/mobile/kitchen/leftovers` [OWNER, MANAGER, KITCHEN_STAFF] | `{ outletId, date }` | `{ ok: true, logged: number }` — leftovers → overproduction waste (same as web) |
| POST | `/api/mobile/kitchen/lock` [OWNER, MANAGER] | `{ outletId, date }` | `{ ok: true }`; already locked → 409 |
| POST | `/api/mobile/waste/recognize` [OWNER, MANAGER, KITCHEN_STAFF] | multipart: `outletId`, `photo` (jpeg/png/webp/heic, ≤ 5 MB) | `VisionResult` |
| DELETE | `/api/mobile/waste/:id?outletId=` [OWNER, MANAGER] | | `{ ok: true }` |
| POST | `/api/mobile/alerts/read-all` | `{ outletId }` | `{ ok: true, updated: number }` |
| POST | `/api/mobile/alerts/scan` [OWNER, MANAGER] | `{ outletId }` | `{ ok: true, created: number }` (ML service down → 503 with message) |
| GET | `/api/mobile/donations/suggest?outletId=&date=` | date defaults to today | `SurplusEstimate` |
| GET | `/api/mobile/donations/ngos?outletId=` | | `{ items: [{ id, name, city, contact, acceptsCooked }] }` |
| POST | `/api/mobile/donations` [OWNER, MANAGER, KITCHEN_STAFF] | `{ outletId, ngoId?, date, meals, dishNames?, note? }` | `{ ok: true, id }` |
| POST | `/api/mobile/donations/:id/status` [OWNER, MANAGER, KITCHEN_STAFF] | `{ outletId, status: PLANNED\|COLLECTED\|CANCELLED }` | `{ ok: true }` |
| GET | `/api/mobile/analytics?outletId=&days=30` | | `{ sales: DayPoint[], accuracy: AccuracyPoint[], waste: { byReason: ReasonSlice[], totalPlates, totalCost }, savings: <savingsEstimate()>, explanations: <nextDayExplanations()> }` (types in `src/lib/analytics.ts`) |
| GET | `/api/mobile/waste-heatmap?outletId=&days=56` | | `{ cells: HeatCell[] }` |
| GET | `/api/mobile/inventory?outletId=` | | `{ rows: StockRow[], suggestedOrders: SuggestedOrder[] }` (read-only) |
| POST | `/api/mobile/whatif` | same body as `/api/whatif` | same response as `/api/whatif` |
| POST | `/api/mobile/staff/invite` [OWNER, MANAGER] | `{ email, role: MANAGER\|KITCHEN_STAFF, outletIds: string[] }` | `{ ok: true, inviteUrl }` (same rules as the web invite form; managers cannot invite managers if the web forbids it) |

All new routes reuse the web's server logic (extract from `src/actions/*` into `src/lib/*` where an
action is tied to the Auth.js session, keeping the web actions calling the shared function).

### v2 implementation notes (server)

- Dates are `YYYY-MM-DD`; malformed → 400. Unknown plan/waste entry/donation/NGO in the outlet → 404.
- `prep-plan/generate`: no plan → draft from forecasts; DRAFT → rebuilt; APPROVED/LOCKED → returned unchanged.
  Needs the ML service when forecasts are missing (down → 503; no active dishes → 422).
- `prep-plan/:id/approve`: body is optional; `notes` (string) is stored on the plan.
- `kitchen/lock`: already locked, no entries for that day, or sold > prepared → 409.
- `waste/recognize`: missing/invalid photo or non-multipart body → 400; ML service down or failing → 503;
  image rejected by the service (4xx) → 422.
- `alerts/scan`: scans the last 14 days. ML down/failing → 503.
- `analytics`: `days` clamped to 7–90, all series up to yesterday; `accuracy` is the per-day series.
- `waste-heatmap`: `days` clamped to 7–365; `weekday` 0 = Monday.
- `donations` POST: JSON `null` fields are treated as absent; `dishNames` is a free-text string.
- `staff/invite`: every id in `outletIds` must be visible to the inviter (403). An invitation carries a single
  outlet, so **only the first id is attached** (more can be assigned on the web Staff page). Existing user → 409.
- CORS now also allows `DELETE`.
