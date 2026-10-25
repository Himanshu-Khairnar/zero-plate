// Pure what-if maths (no Prisma, no server-only) shared by `/api/whatif` and
// `/api/mobile/whatif`, so the simulator and the daily plan always agree.

import type { Scenario, WhatIfDish, WhatIfResponse } from "@/lib/ml";
import { economics, median, riskWeight, round, suggestedQty } from "@/lib/prep";

export type WhatIfLine = WhatIfDish & {
  riskWeight: number;
  prepQty: number;
  prepCost: number;
  expectedRevenue: number;
  wastePlates: number;
  wasteCost: number;
  lostSales: number;
};

export type WhatIfTotals = {
  likely: number;
  prepQty: number;
  prepCost: number;
  expectedRevenue: number;
  wastePlates: number;
  wasteCost: number;
  lostSales: number;
};

function enrich(rows: WhatIfDish[], medianCost: number): WhatIfLine[] {
  return rows.map((r) => {
    const w = riskWeight(r.costPerPlate, medianCost);
    const prepQty = suggestedQty(r, w);
    return { ...r, riskWeight: w, prepQty, ...economics(prepQty, r, r.price, r.costPerPlate) };
  });
}

export function whatIfTotals(rows: WhatIfLine[]): WhatIfTotals {
  const sum = (k: keyof WhatIfLine) => round(rows.reduce((s, r) => s + (r[k] as number), 0), 2);
  return {
    likely: sum("likely"),
    prepQty: sum("prepQty"),
    prepCost: sum("prepCost"),
    expectedRevenue: sum("expectedRevenue"),
    wastePlates: sum("wastePlates"),
    wasteCost: sum("wasteCost"),
    lostSales: sum("lostSales"),
  };
}

/**
 * The what-if response body: the ML service's baseline and scenario demand with
 * the same risk-aware prep rule the daily plan uses applied to both.
 */
export function whatIfResult(res: WhatIfResponse, scenario: Scenario) {
  const medianCost = median(res.baseline.map((r) => r.costPerPlate).filter((c) => c > 0));
  const baseline = enrich(res.baseline, medianCost);
  const changed = enrich(res.scenario, medianCost);
  return {
    date: res.date,
    modelVersion: res.modelVersion,
    assumed: res.assumed,
    scenario,
    baseline: { rows: baseline, totals: whatIfTotals(baseline) },
    scenario_result: { rows: changed, totals: whatIfTotals(changed) },
  };
}
