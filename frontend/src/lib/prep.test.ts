import { describe, expect, it } from "vitest";

import { costPerPlate, economics, ingredientNeeds, median, riskWeight, suggestedQty } from "./prep";

describe("riskWeight", () => {
  it("is 0.5 for a dish at the median cost", () => {
    expect(riskWeight(40, 40)).toBe(0.5);
  });
  it("leans towards the high forecast for cheap dishes and towards likely for costly ones", () => {
    expect(riskWeight(20, 40)).toBe(1); // half the median cost -> cook to high
    expect(riskWeight(80, 40)).toBe(0.25); // double the median -> closer to likely
    expect(riskWeight(400, 40)).toBeCloseTo(0.05, 2);
  });
  it("falls back to balanced when costs are unknown", () => {
    expect(riskWeight(0, 40)).toBe(0.5);
    expect(riskWeight(40, 0)).toBe(0.5);
  });
});

describe("suggestedQty", () => {
  const range = { low: 30, likely: 50, high: 70 };
  it("returns likely at weight 0 and high at weight 1", () => {
    expect(suggestedQty(range, 0)).toBe(50);
    expect(suggestedQty(range, 1)).toBe(70);
    expect(suggestedQty(range, 0.5)).toBe(60);
  });
  it("never goes negative or below likely when high < likely", () => {
    expect(suggestedQty({ low: 0, likely: 10, high: 5 }, 1)).toBe(10);
    expect(suggestedQty({ low: 0, likely: 0, high: 0 }, 1)).toBe(0);
  });
});

describe("ingredientNeeds", () => {
  it("rolls plates up into ingredient quantities and cost, sorted by cost", () => {
    const rice = { ingredientId: "rice", name: "Rice", unit: "kg", costPerUnit: 100, qtyPerPlate: 0.1 };
    const oil = { ingredientId: "oil", name: "Oil", unit: "l", costPerUnit: 150, qtyPerPlate: 0.02 };
    const needs = ingredientNeeds([
      { dishName: "Pulao", plannedQty: 50, recipe: [rice, oil] },
      { dishName: "Khichdi", plannedQty: 20, recipe: [rice] },
    ]);
    expect(needs).toHaveLength(2);
    expect(needs[0]).toMatchObject({ ingredientId: "rice", qty: 7, cost: 700 });
    expect(needs[0].dishes.map((d) => d.dishName)).toEqual(["Pulao", "Khichdi"]);
    expect(needs[1]).toMatchObject({ ingredientId: "oil", qty: 1, cost: 150 });
  });
});

describe("costPerPlate and economics", () => {
  it("computes cost per plate from recipe lines", () => {
    expect(costPerPlate([{ qtyPerPlate: 0.1, costPerUnit: 100 }, { qtyPerPlate: 0.5, costPerUnit: 4 }])).toBe(12);
  });
  it("splits prep into expected waste and lost sales", () => {
    const over = economics(60, { low: 30, likely: 50, high: 70 }, 100, 20);
    expect(over).toMatchObject({ prepCost: 1200, expectedRevenue: 5000, wastePlates: 10, wasteCost: 200, lostSales: 0 });
    const under = economics(40, { low: 30, likely: 50, high: 70 }, 100, 20);
    expect(under).toMatchObject({ wastePlates: 0, lostSales: 1000, expectedRevenue: 4000 });
  });
});

describe("median", () => {
  it("handles odd, even and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(median([1, Number.NaN, 3])).toBe(2);
  });
});
