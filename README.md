# WasteLess — AI demand forecasting to cut restaurant food waste

Monorepo for the WasteLess project plan (`WasteLess AI Demand Forecasting to Cut Restaurant Food Waste.pdf`).

```
frontend/   Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui, Prisma)
backend/    FastAPI ML service (Python 3.13, pandas, LightGBM)
```

This repo currently contains **Himanshu's slice — modules E, F and J**: the demand forecasting engine,
prep planning and the what-if simulator, across frontend, backend, ML and DevOps. The other slices
(auth, data ingestion, kitchen mode, vision, analytics, assistant) plug into the same schema and
service contract.

## Quick start (local, zero setup)

Local development uses SQLite so nothing has to be installed besides Node and Python.

```bash
# 1. Database + frontend
cd frontend
npm install
cp .env.example .env            # DATABASE_URL=file:./dev.db, ML_SERVICE_URL=http://localhost:8000
npx prisma db push              # creates prisma/dev.db from prisma/schema.prisma

# 2. ML service
cd ../backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
cp .env.example .env
python -m app.data.seed         # demo outlet, menu, recipes, 26 weeks of sales
python -m app.jobs.weekly_retrain   # backtest naive vs seasonal vs LightGBM, promote the winner
python -m app.jobs.nightly_forecast # write 7-day forecasts
fastapi dev app/main.py         # http://localhost:8000, docs at /docs

# 3. App
cd ../frontend
npm run dev                     # http://localhost:3000
```

Switching to PostgreSQL (the production target in the plan): set `provider = "postgresql"` in
`frontend/prisma/schema.prisma`, point both `DATABASE_URL`s at the database, run `npx prisma db push`.
`docker-compose.yml` brings up Postgres, the ML service and the scheduler.

## What is here

### Frontend (`frontend/`)

| Page | What it does |
| --- | --- |
| `/` | Overview: tomorrow's demand, plan status, model accuracy vs. the naive baseline. |
| `/forecasts` | Per-dish chart (4 weeks sold + forecast with 10–90% band) and the day's table with plain-language reasons. |
| `/prep` | Daily prep list: risk-aware plates per dish, editable, ingredient roll-up from recipes, adjustment log, approve. |
| `/prep/print` | Printable kitchen sheet (plates + ingredients + tick boxes). |
| `/whatif` | What-if simulator: rain, temperature, holiday, discount, dish subset → demand, prep, cost, waste side by side. |
| `/models` | Model comparison from the weekly backtest, feature importance, training history. |

Route Handlers (the contract other slices use):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/outlets` | outlets |
| GET | `/api/forecasts?outletId&start&end` | stored forecasts |
| POST | `/api/forecasts` `{outletId, startDate?, days?}` | ask the ML service to (re)generate |
| GET | `/api/prep-plans?outletId&date` | get or draft the day's plan |
| POST | `/api/prep-plans` `{outletId, date}` | rebuild a draft from fresh forecasts |
| PATCH | `/api/prep-plans/:id` `{items:[{dishId, plannedQty, reason?}], adjustedBy?}` | adjust (every change logged) |
| POST | `/api/prep-plans/:id/approve` `{approvedBy?, notes?}` | approve |
| POST | `/api/whatif` `{outletId, date, scenario}` | scenario vs. baseline with prep economics |
| GET/POST | `/api/models?outletId` | training history / retrain now |

Key code: `src/lib/prep.ts` (risk-aware quantity rule, ingredient roll-up), `src/lib/prep-plans.ts`
(plan lifecycle), `src/lib/ml.ts` (ML service client), `prisma/schema.prisma` (shared schema).

### ML service (`backend/`)

- `app/ml/features.py` — calendar, holiday distance, weather, horizon-safe lags (7/14/21/28, rolling 7/28), dish attributes, promotion flag.
- `app/ml/models.py` — naive (same day last week), seasonal naive, LightGBM Poisson with a dispersion-calibrated 10–90% range; Prophet joins the comparison if installed.
- `app/ml/backtest.py` — rolling-origin backtest (4 weekly folds, 7-day horizon): MAE, MAPE, sMAPE, bias, coverage.
- `app/ml/train.py` — compare, pick the winner, version the artifact (`models/<outlet>/<version>/`), record a `ModelRun`. Cold start: outlets with < 8 weeks of history train on all outlets' data.
- `app/ml/predict.py` — nightly forecasts and what-if scenarios; `app/ml/explain.py` turns features into a sentence.
- `app/external/` — Open-Meteo weather (archive + forecast, climatology fallback) and public holidays.
- `app/jobs/` — `nightly_forecast`, `weekly_retrain`, `scheduler` (no-cron hosts); `deploy/crontab` for real cron.
- `app/data/` — synthetic generator and seed.
- `tests/` — `pytest -q`.

Endpoints: `GET /api/health`, `GET /api/outlets`, `POST /api/train`, `GET /api/models/{outletId}`,
`POST /api/forecast/run`, `GET /api/forecast/{outletId}?start&end`, `POST /api/whatif`.

## Conventions

- Business dates are `YYYY-MM-DD` strings (calendar days in the outlet's timezone); timestamps are real `DateTime`s.
- The ML service writes forecasts and model runs straight to the shared database; Next.js reads them. Only
  "generate now", "what-if" and "retrain now" call the service synchronously.
- `shadcn` components live in `src/components/ui`; add more with `npx shadcn@latest add <component>`.
