import { describe, expect, it } from "vitest";

import type { WhatIfDish, WhatIfResponse } from "./ml";
import { clampInt } from "./mobile-token";
import { whatIfResult } from "./whatif";

const dish = (over: Partial<WhatIfDish>): WhatIfDish => ({
  dishId: "d",
  dishName: "Dish",
  low: 8,
  likely: 10,
  high: 14,
  price: 200,
  costPerPlate: 50,
  explanation: "",
  ...over,
});

const response = (baseline: WhatIfDish[], scenario: WhatIfDish[]): WhatIfResponse => ({
  date: "2099-01-01",
  modelVersion: "test",
  assumed: { rainMm: null, tempMax: null, isHoliday: false, holidayName: null, isWeekend: false },
  baseline,
  scenario,
});

describe("whatIfResult", () => {
  it("applies the plan's prep rule to both sides and totals the lines", () => {
    const base = [dish({ dishId: "a" }), dish({ dishId: "b", costPerPlate: 100, likely: 20, low: 15, high: 30 })];
    const rainy = base.map((d) => ({ ...d, likely: d.likely * 0.8, low: d.low * 0.8, high: d.high * 0.8 }));
    const out = whatIfResult(response(base, rainy), { rainMm: 30 });

    expect(out.scenario).toEqual({ rainMm: 30 });
    expect(out.baseline.rows).toHaveLength(2);
    expect(out.baseline.totals.likely).toBe(30);
    expect(out.baseline.totals.prepQty).toBe(out.baseline.rows.reduce((s, r) => s + r.prepQty, 0));
    // Less demand in the scenario means less to prep.
    expect(out.scenario_result.totals.prepQty).toBeLessThan(out.baseline.totals.prepQty);
    // The cheaper dish leans further above likely than the costly one.
    const [a, b] = out.baseline.rows;
    expect(a.riskWeight).toBeGreaterThan(b.riskWeight);
  });

  it("handles an empty menu", () => {
    const out = whatIfResult(response([], []), {});
    expect(out.baseline.totals).toEqual({ likely: 0, prepQty: 0, prepCost: 0, expectedRevenue: 0, wastePlates: 0, wasteCost: 0, lostSales: 0 });
  });
});

describe("clampInt", () => {
  it("falls back when absent or not a number, and clamps to the range", () => {
    expect(clampInt(null, 7, 90, 30)).toBe(30);
    expect(clampInt("", 7, 90, 30)).toBe(30);
    expect(clampInt("abc", 7, 90, 30)).toBe(30);
    expect(clampInt("3", 7, 90, 30)).toBe(7);
    expect(clampInt("500", 7, 90, 30)).toBe(90);
    expect(clampInt("45.6", 7, 90, 30)).toBe(46);
  });
});
