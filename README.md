# WasteLess — AI demand forecasting to cut restaurant food waste

Implementation of the project plan in `docs/WasteLess AI Demand Forecasting to Cut Restaurant Food Waste.pdf`:
a multi-tenant web platform that predicts how much of each dish an outlet will sell, turns that into a
daily prep and purchase plan, tracks what was sold and wasted, and learns from every logged day.

```
frontend/   Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui, Prisma 6, Auth.js v5)
backend/    FastAPI ML service (Python 3.13, pandas, scikit-learn, LightGBM)
```

## Module status (plan §4)

| Module | What | Where |
| --- | --- | --- |
| A Auth & multi-tenancy | Register/login, roles (Owner, Manager, Kitchen staff, Platform admin), invitations, role-aware shell | `frontend/src/auth*.ts`, `(auth)/`, `components/dashboard/` |
| B Data ingestion | CSV/Excel upload with column mapping + validation, manual daily entry, mock POS API | `/sales`, `actions/sales.ts`, `api/pos/sales` |
| C Menu & recipes | Dishes, ingredients, recipe builder, cost per plate and margin, spreadsheet round-trip | `/menu`, `/data`, `actions/menu.ts`, `actions/import-sheets.ts` |
| D Inventory & suppliers | Stock in/out with expiry and "use first", suppliers and price lists, purchase orders suggested from forecasts | `/inventory`, `lib/stock.ts`, `actions/inventory.ts` |
| E Forecasting engine (ML) | Per-dish 1–7 day forecasts with low/likely/high range, weather + holidays, weekly retrain and model selection | `/forecasts`, `backend/app/ml/` |
| F Prep planning | Risk-aware prep list, ingredient roll-up, manager adjust/approve (logged), printable kitchen sheet | `/prep-plan`, `/kitchen/prep`, `lib/prep*.ts` |
| G Kitchen mode | Large-button shift logging, leftovers, end-of-day lock | `/kitchen`, `actions/kitchen.ts` |
| H Waste tracking (ML) | Waste log by reason with photos, tablet capture flow with model suggestions (heuristic stand-in for the CNN/YOLO detector) | `/waste-log`, `/kitchen/waste`, `backend/app/api/vision.py` |
| I Analytics (ML) | Dashboards with real KPIs, revenue/waste/accuracy charts, waste heatmap, K-means menu engineering, plain-language explanations | `/analytics`, `/waste-heatmap`, `lib/analytics.ts`, `backend/app/ml/menu_engineering.py` |
| J What-if simulator | Rain, temperature, holiday, discount, dish subset → demand, prep, cost and waste side by side | `/whatif`, `api/whatif` |
| K Anomaly detection & alerts (ML) | Isolation Forest + robust z-score on daily sales; low stock, expiry, shortage and plan-pending alerts; bell in header; email via Resend | `/alerts`, `lib/alerts.ts`, `backend/app/ml/anomaly.py` |
| L AI assistant (ML) | Claude with tool calling over the app's own data (`ANTHROPIC_API_KEY`), rule-based fallback otherwise | `/assistant`, `lib/assistant/`, `api/assistant` |
| M Surplus redistribution | Surplus prediction, NGO directory, donation log, meals-donated counter | `/donations`, `actions/donations.ts` |
| N Reports & admin | Excel/PDF/CSV reports; tenants, model drift and audit logs for the platform team; staff and settings for owners | `/reports`, `/admin/*`, `/staff`, `/settings` |

## Quick start (local, zero setup)

Local development runs a real Postgres in-process (PGlite over the Postgres wire protocol), so nothing
has to be installed besides Node 20+ and Python 3.13.

```bash
# 1. Database (terminal 1)
cd frontend
npm install
cp .env.example .env            # DATABASE_URL already points at the local server; set AUTH_SECRET
npm run db:local                # Postgres on 127.0.0.1:5433, data in frontend/.pglite

# 2. Schema + demo organisation (terminal 2)
cd frontend
npm run db:push                 # prisma db push
npx prisma db seed              # Spice Garden Group, 2 outlets, 4 demo users

# 3. ML service: menu, 26 weeks of sales, inventory, waste, models, forecasts
cd ../backend
python -m venv .venv && .venv\Scripts\activate     # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env
python -m app.data.seed --outlet outlet_andheri && python -m app.data.seed --outlet outlet_bandra --seed 11
python -m app.data.seed_inventory --outlet outlet_andheri && python -m app.data.seed_inventory --outlet outlet_bandra
python -m app.data.seed_waste --outlet outlet_andheri && python -m app.data.seed_waste --outlet outlet_bandra
python -m app.jobs.weekly_retrain && python -m app.jobs.nightly_forecast
fastapi dev app/main.py         # http://localhost:8000, docs at /docs

# 4. App (terminal 3)
cd frontend
npm run dev                     # http://localhost:3000
```

Demo accounts (password `Password123!`): `owner@wasteless.local`, `manager@wasteless.local`,
`kitchen@wasteless.local`, `admin@wasteless.local`.

**Shared/production database:** point both `DATABASE_URL`s (frontend `postgresql://…`, backend
`postgresql+psycopg://…`) at Neon or any Postgres, set `DB_POOL_MAX=5` or more, run `npm run db:push`.
`docker-compose.yml` brings up Postgres, the ML service and the job scheduler.

## Daily loop

1. **Overnight** — `app.jobs.nightly_forecast`: fetches weather (Open-Meteo) and holidays, writes 7-day
   forecasts per dish, scans sales for anomalies.
2. **Morning** — the manager opens the prep plan (drafted from the forecast with risk-aware quantities),
   adjusts (every change logged), approves; kitchen mode's prep targets update; the kitchen sheet prints.
3. **Service** — kitchen staff log prepared/sold per shift; leftovers can be logged as waste or donated.
4. **Closing** — the day is locked; "sold" counts feed the forecaster alongside imported sales.
5. **Weekly** — `app.jobs.weekly_retrain`: naive vs. seasonal vs. LightGBM backtest on the last 4 weeks,
   winner promoted and versioned; drift visible on the admin panel.

## Tests

```bash
cd frontend && npm test          # Vitest: prep maths, CSV parsing, dates
cd frontend && npm run lint && npm run typecheck
cd backend  && pytest -q         # features, backtest, models, explanations, vision, anomaly, API
```

## Conventions

- Business dates are `YYYY-MM-DD` strings (calendar days in the outlet's timezone); timestamps are real
  `DateTime`s. The ML service writes forecasts, model runs and alerts straight to the shared database.
- Server actions live in `src/actions/*` and go through `guarded` / `requireOutletActor` / `audit`
  (`src/lib/guard.ts`); route handlers use `handle` / `requireOutletAccess` (`src/lib/api.ts`).
- UI uses shadcn/ui (base-ui) components only, with the tweakcn "perpetuity" theme; colours come from
  theme tokens (primary and its shades), never named Tailwind colours.
- Every write is recorded in `AuditLog`.

## Environment variables

See `frontend/.env.example` and `backend/.env.example`. Optional integrations: `ANTHROPIC_API_KEY`
(assistant), `RESEND_API_KEY` + `ALERT_EMAIL_TO` (alert emails), `POS_API_KEY` (POS push).
