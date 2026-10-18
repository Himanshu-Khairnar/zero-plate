import { ApiError, handle, readJson, requireOutletAccess, requireString } from "@/lib/api";
import { isIsoDate } from "@/lib/dates";
import { ml, type Scenario, type WhatIfDish } from "@/lib/ml";
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

function totals(rows: WhatIfLine[]): WhatIfTotals {
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
 * POST /api/whatif { outletId, date, scenario }
 * The ML service returns baseline and scenario demand; here we apply the same
 * risk-aware prep rule the daily plan uses, so the two always agree.
 */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ outletId?: unknown; date?: unknown; scenario?: Scenario }>(req);
  const outletId = requireString(body.outletId, "outletId");
  await requireOutletAccess(outletId);
  const date = requireString(body.date, "date");
  if (!isIsoDate(date)) throw new ApiError("date must be YYYY-MM-DD.");
  const scenario: Scenario = body.scenario ?? {};

  const res = await ml.whatIf({ outletId, date, scenario });
  const medianCost = median(res.baseline.map((r) => r.costPerPlate).filter((c) => c > 0));
  const baseline = enrich(res.baseline, medianCost);
  const changed = enrich(res.scenario, medianCost);
  return Response.json({
    date: res.date,
    modelVersion: res.modelVersion,
    assumed: res.assumed,
    scenario,
    baseline: { rows: baseline, totals: totals(baseline) },
    scenario_result: { rows: changed, totals: totals(changed) },
  });
});
