import "server-only";

/**
 * Client for the Python ML service (FastAPI). This is the only place the
 * Next.js app talks to it; everything else goes through the shared database.
 * Contract: backend/app/schemas.py
 */

const BASE = process.env.ML_SERVICE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Long enough for a free-tier cold start (~50 s), short enough that a dead service fails instead of hanging. */
export const ML_TIMEOUT_MS = 60_000;

export class MlServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(ML_TIMEOUT_MS),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      throw new MlServiceError("The forecasting service did not respond in time. It may be waking up; try again in a minute.", 503);
    }
    throw new MlServiceError(
      `ML service unreachable at ${BASE}. Start it with "fastapi dev app/main.py" in backend/. (${(err as Error).message})`,
      503,
    );
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error body */
    }
    throw new MlServiceError(`ML service: ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

export type MlForecastRow = {
  outletId: string;
  dishId: string;
  dishName: string | null;
  date: string;
  low: number;
  likely: number;
  high: number;
  modelVersion: string;
  explanation: string;
};

export type Scenario = {
  rainMm?: number;
  tempMax?: number;
  isHoliday?: boolean;
  discountPct?: number;
  promo?: boolean;
  dishIds?: string[];
};

export type WhatIfDish = {
  dishId: string;
  dishName: string;
  low: number;
  likely: number;
  high: number;
  price: number;
  costPerPlate: number;
  explanation: string;
};

export type WhatIfResponse = {
  date: string;
  modelVersion: string;
  assumed: {
    rainMm: number | null;
    tempMax: number | null;
    isHoliday: boolean;
    holidayName: string | null;
    isWeekend: boolean;
  };
  baseline: WhatIfDish[];
  scenario: WhatIfDish[];
};

export type BacktestMetrics = {
  mae: number;
  mape: number;
  smape: number;
  bias: number;
  coverage: number;
  range_width: number;
  n: number;
};

export type TrainResult = {
  outletId: string;
  version: string;
  model: string;
  promoted: boolean;
  winner: string;
  improvement_vs_naive_pct: number | null;
  train_rows: number;
  results: { model: string; overall: BacktestMetrics | null; folds: (BacktestMetrics & { origin: string })[]; error?: string }[];
  model_info: { name: string; feature_importance?: Record<string, number>; dispersion?: number; z?: number };
};

export const ml = {
  health: () => call<{ status: string; database: string }>("/api/health"),

  generateForecasts: (body: { outletId: string; startDate?: string; days?: number }) =>
    call<MlForecastRow[]>("/api/forecast/run", { method: "POST", body: JSON.stringify(body) }),

  whatIf: (body: { outletId: string; date: string; scenario: Scenario }) =>
    call<WhatIfResponse>("/api/whatif", { method: "POST", body: JSON.stringify(body) }),

  train: (body: { outletId: string; promote?: boolean }) =>
    call<TrainResult>("/api/train", { method: "POST", body: JSON.stringify(body) }),
};
