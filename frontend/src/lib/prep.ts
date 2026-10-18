/**
 * Prep planning: turn a forecast range into a number the kitchen cooks.
 *
 * Risk-aware quantities (plan, module F): cooking too much of a costly dish
 * wastes money, cooking too little of a cheap side loses sales for almost
 * nothing. So each dish gets a weight between 0 (cook the "likely" number)
 * and 1 (cook the "high" number) that falls as the dish's cost per plate
 * rises relative to the menu's median cost.
 */

export type Range = { low: number; likely: number; high: number };

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** 0..1, where cheap dishes lean towards the high forecast. */
export function riskWeight(costPerPlate: number, medianCost: number): number {
  if (!(medianCost > 0) || !(costPerPlate > 0)) return 0.5;
  // cost == median -> 0.5, half the median -> 1, double the median -> 0.25
  const w = (0.5 * medianCost) / costPerPlate;
  return Math.min(1, Math.max(0, Number(w.toFixed(3))));
}

export function suggestedQty(range: Range, weight: number): number {
  const q = range.likely + weight * Math.max(range.high - range.likely, 0);
  return Math.max(0, Math.round(q));
}

export type RecipeLine = {
  ingredientId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  qtyPerPlate: number;
};

export type IngredientNeed = {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  cost: number;
  dishes: { dishName: string; qty: number }[];
};

/** Roll planned plates up into ingredient quantities and cost. */
export function ingredientNeeds(
  items: { dishName: string; plannedQty: number; recipe: RecipeLine[] }[],
): IngredientNeed[] {
  const byId = new Map<string, IngredientNeed>();
  for (const item of items) {
    for (const line of item.recipe) {
      const qty = line.qtyPerPlate * item.plannedQty;
      const need = byId.get(line.ingredientId) ?? {
        ingredientId: line.ingredientId,
        name: line.name,
        unit: line.unit,
        qty: 0,
        cost: 0,
        dishes: [],
      };
      need.qty += qty;
      need.cost += qty * line.costPerUnit;
      need.dishes.push({ dishName: item.dishName, qty });
      byId.set(line.ingredientId, need);
    }
  }
  return [...byId.values()]
    .map((n) => ({ ...n, qty: round(n.qty, 3), cost: round(n.cost, 2) }))
    .sort((a, b) => b.cost - a.cost);
}

export function costPerPlate(recipe: { qtyPerPlate: number; costPerUnit: number }[]): number {
  return round(recipe.reduce((s, r) => s + r.qtyPerPlate * r.costPerUnit, 0), 2);
}

/** Expected economics of cooking `prepQty` plates when demand is `range`. */
export function economics(prepQty: number, range: Range, price: number, cost: number) {
  const expectedSold = Math.min(prepQty, range.likely);
  const wastePlates = Math.max(prepQty - range.likely, 0);
  const shortPlates = Math.max(range.likely - prepQty, 0);
  return {
    prepCost: round(prepQty * cost, 2),
    expectedRevenue: round(expectedSold * price, 2),
    wastePlates: round(wastePlates, 1),
    wasteCost: round(wastePlates * cost, 2),
    lostSales: round(shortPlates * price, 2),
  };
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
