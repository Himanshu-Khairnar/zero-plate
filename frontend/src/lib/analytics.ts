import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, today, tomorrow } from "@/lib/dates";
import { costPerPlate, round } from "@/lib/prep";

/**
 * Module I: numbers behind the analytics page and the dashboards.
 *
 * Assumptions, stated once:
 * - Sales = SalesRecord rows (POS/import) ∪ kitchen-mode "sold" counts; for a
 *   dish-day with both, SalesRecord wins (same rule as the ML service).
 * - Waste cost = plates × dish cost per plate (recipe at current prices) or
 *   ingredient units × cost per unit.
 * - "Money saved" compares the waste share (waste cost / revenue) of the
 *   first two weeks of waste history with the latest two weeks and applies
 *   the reduction to the latest 30 days of revenue. It is an estimate.
 * - CO₂ avoided uses 2.5 kg CO₂e per kg of food and 0.35 kg per plate
 *   (WRAP / FAO order-of-magnitude figures).
 */

export const CO2_PER_KG_FOOD = 2.5;
export const KG_PER_PLATE = 0.35;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type DayPoint = { date: string; plates: number; revenue: number };
export type AccuracyPoint = { date: string; actual: number; likely: number; low: number; high: number };
export type ReasonSlice = { reason: string; plates: number; cost: number };
export type HeatCell = { dishId: string; dishName: string; weekday: number; plates: number; cost: number };

async function dishCostMap(outletId: string) {
  const dishes = await prisma.dish.findMany({ where: { outletId }, include: { recipeItems: { include: { ingredient: true } } } });
  const cost = new Map<string, number>();
  const name = new Map<string, string>();
  const price = new Map<string, number>();
  for (const d of dishes) {
    cost.set(d.id, costPerPlate(d.recipeItems.map((r) => ({ qtyPerPlate: r.qtyPerPlate, costPerUnit: r.ingredient.costPerUnit }))));
    name.set(d.id, d.name);
    price.set(d.id, d.price);
  }
  return { cost, name, price };
}

/** Plates and revenue per dish-day for [start, end], merging POS rows and kitchen logs. */
export async function salesByDishDay(outletId: string, start: string, end: string) {
  const [pos, kitchen, { price }] = await Promise.all([
    prisma.salesRecord.findMany({ where: { dish: { outletId }, date: { gte: start, lte: end } }, select: { dishId: true, date: true, qtySold: true, price: true } }),
    prisma.kitchenLog.findMany({
      where: { outletId, date: { gte: new Date(`${start}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) }, sold: { gt: 0 } },
      select: { dishId: true, date: true, sold: true },
    }),
    dishCostMap(outletId),
  ]);
  const map = new Map<string, { dishId: string; date: string; plates: number; revenue: number }>();
  for (const r of pos) {
    const k = `${r.dishId}|${r.date}`;
    const cur = map.get(k) ?? { dishId: r.dishId, date: r.date, plates: 0, revenue: 0 };
    cur.plates += r.qtySold;
    cur.revenue += r.qtySold * r.price;
    map.set(k, cur);
  }
  for (const k of kitchen) {
    const date = k.date.toISOString().slice(0, 10);
    const key = `${k.dishId}|${date}`;
    if (map.has(key)) continue; // POS rows win
    const cur = { dishId: k.dishId, date, plates: k.sold, revenue: k.sold * (price.get(k.dishId) ?? 0) };
    map.set(key, cur);
  }
  return [...map.values()];
}

export async function salesSeries(outletId: string, days = 30): Promise<DayPoint[]> {
  const end = addDays(today(), -1);
  const start = addDays(end, -(days - 1));
  const rows = await salesByDishDay(outletId, start, end);
  const byDay = new Map<string, DayPoint>();
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    byDay.set(d, { date: d, plates: 0, revenue: 0 });
  }
  for (const r of rows) {
    const p = byDay.get(r.date);
    if (!p) continue;
    p.plates += r.plates;
    p.revenue += r.revenue;
  }
  return [...byDay.values()].map((p) => ({ ...p, revenue: round(p.revenue, 0) }));
}

/** Forecast vs actual on past days that have both. */
export async function forecastAccuracy(outletId: string, days = 28) {
  const end = addDays(today(), -1);
  const start = addDays(end, -(days - 1));
  const [forecasts, sales] = await Promise.all([
    prisma.forecast.findMany({ where: { outletId, date: { gte: start, lte: end } }, select: { dishId: true, date: true, low: true, likely: true, high: true } }),
    salesByDishDay(outletId, start, end),
  ]);
  const actual = new Map(sales.map((s) => [`${s.dishId}|${s.date}`, s.plates]));
  let n = 0, apeSum = 0, inside = 0, absErr = 0;
  const byDay = new Map<string, AccuracyPoint>();
  for (const f of forecasts) {
    const a = actual.get(`${f.dishId}|${f.date}`);
    if (a == null) continue;
    n += 1;
    absErr += Math.abs(f.likely - a);
    if (a > 0) apeSum += Math.abs(f.likely - a) / a;
    if (a >= f.low && a <= f.high) inside += 1;
    const p = byDay.get(f.date) ?? { date: f.date, actual: 0, likely: 0, low: 0, high: 0 };
    p.actual += a; p.likely += f.likely; p.low += f.low; p.high += f.high;
    byDay.set(f.date, p);
  }
  return {
    n,
    mape: n ? round((apeSum / n) * 100, 1) : null,
    mae: n ? round(absErr / n, 2) : null,
    coverage: n ? round(inside / n, 3) : null,
    series: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ ...p, actual: round(p.actual, 0), likely: round(p.likely, 0), low: round(p.low, 0), high: round(p.high, 0) })),
  };
}

export async function wasteSummary(outletId: string, days = 30) {
  const end = addDays(today(), -1);
  const start = addDays(end, -(days - 1));
  const [logs, { cost, name }, ingredients] = await Promise.all([
    prisma.wasteLog.findMany({ where: { outletId, date: { gte: start, lte: end } } }),
    dishCostMap(outletId),
    prisma.ingredient.findMany({ where: { outletId }, select: { id: true, costPerUnit: true, name: true } }),
  ]);
  const ingCost = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));
  const perDay = new Map<string, { date: string; plates: number; cost: number }>();
  const byReason = new Map<string, ReasonSlice>();
  const heat = new Map<string, HeatCell>();
  let plates = 0, totalCost = 0;
  for (const w of logs) {
    const c = w.dishId ? w.qty * (cost.get(w.dishId) ?? 0) : w.qty * (w.ingredientId ? (ingCost.get(w.ingredientId) ?? 0) : 0);
    const p = w.dishId ? w.qty : 0;
    plates += p; totalCost += c;
    const d = perDay.get(w.date) ?? { date: w.date, plates: 0, cost: 0 };
    d.plates += p; d.cost += c; perDay.set(w.date, d);
    const r = byReason.get(w.reason) ?? { reason: w.reason, plates: 0, cost: 0 };
    r.plates += p; r.cost += c; byReason.set(w.reason, r);
    if (w.dishId) {
      const [y, m, dd] = w.date.split("-").map(Number);
      const weekday = (new Date(y, m - 1, dd).getDay() + 6) % 7; // Mon = 0
      const k = `${w.dishId}|${weekday}`;
      const h = heat.get(k) ?? { dishId: w.dishId, dishName: name.get(w.dishId) ?? w.dishId, weekday, plates: 0, cost: 0 };
      h.plates += w.qty; h.cost += c; heat.set(k, h);
    }
  }
  return {
    days,
    plates: round(plates, 0),
    cost: round(totalCost, 0),
    perDay: [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, cost: round(d.cost, 0) })),
    byReason: [...byReason.values()].map((r) => ({ ...r, cost: round(r.cost, 0) })).sort((a, b) => b.cost - a.cost),
    heatmap: [...heat.values()].map((h) => ({ ...h, cost: round(h.cost, 0), plates: round(h.plates, 0) })),
    weekdays: WEEKDAYS,
  };
}

/** Estimated money saved: waste share in the first 2 weeks of history vs the latest 2 weeks, applied to recent revenue. */
export async function savingsEstimate(outletId: string) {
  const first = await prisma.wasteLog.findFirst({ where: { outletId }, orderBy: { date: "asc" }, select: { date: true } });
  if (!first) return { moneySaved: 0, baselineShare: null, currentShare: null, note: "No waste history yet." };
  const baseEnd = addDays(first.date, 13);
  const curEnd = addDays(today(), -1);
  const curStart = addDays(curEnd, -13);
  const [baseWaste, curWaste, baseSales, curSales, sales30] = await Promise.all([
    wasteCostBetween(outletId, first.date, baseEnd),
    wasteCostBetween(outletId, curStart, curEnd),
    salesByDishDay(outletId, first.date, baseEnd),
    salesByDishDay(outletId, curStart, curEnd),
    salesByDishDay(outletId, addDays(curEnd, -29), curEnd),
  ]);
  const rev = (rows: { revenue: number }[]) => rows.reduce((s, r) => s + r.revenue, 0);
  const baseShare = rev(baseSales) ? baseWaste / rev(baseSales) : null;
  const curShare = rev(curSales) ? curWaste / rev(curSales) : null;
  if (baseShare == null || curShare == null || curEnd <= baseEnd) {
    return { moneySaved: 0, baselineShare: baseShare, currentShare: curShare, note: "Need more than two weeks of waste history to compare." };
  }
  const saved = Math.max(0, (baseShare - curShare) * rev(sales30));
  return { moneySaved: round(saved, 0), baselineShare: round(baseShare * 100, 1), currentShare: round(curShare * 100, 1), note: "Waste share of revenue, first 2 weeks vs latest 2 weeks, applied to the last 30 days." };
}

async function wasteCostBetween(outletId: string, start: string, end: string) {
  const [logs, { cost }, ingredients] = await Promise.all([
    prisma.wasteLog.findMany({ where: { outletId, date: { gte: start, lte: end } }, select: { dishId: true, ingredientId: true, qty: true } }),
    dishCostMap(outletId),
    prisma.ingredient.findMany({ where: { outletId }, select: { id: true, costPerUnit: true } }),
  ]);
  const ing = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));
  return logs.reduce((s, w) => s + (w.dishId ? w.qty * (cost.get(w.dishId) ?? 0) : w.qty * (w.ingredientId ? (ing.get(w.ingredientId) ?? 0) : 0)), 0);
}

export function co2AvoidedKg(platesSaved: number) {
  return round(platesSaved * KG_PER_PLATE * CO2_PER_KG_FOOD, 1);
}

export async function mealsDonated(outletId: string) {
  const monthStart = `${today().slice(0, 7)}-01`;
  const [month, all] = await Promise.all([
    prisma.donation.aggregate({ where: { outletId, status: "COLLECTED", date: { gte: monthStart } }, _sum: { meals: true } }),
    prisma.donation.aggregate({ where: { outletId, status: "COLLECTED" }, _sum: { meals: true } }),
  ]);
  return { month: month._sum.meals ?? 0, all: all._sum.meals ?? 0 };
}

export async function nextDayExplanations(outletId: string, limit = 5) {
  const rows = await prisma.forecast.findMany({ where: { outletId, date: tomorrow() }, include: { dish: { select: { name: true } } }, orderBy: { likely: "desc" }, take: limit });
  return rows.map((r) => ({ dish: r.dish.name, likely: Math.round(r.likely), explanation: r.explanation }));
}

/** One call for the analytics page and dashboards. */
export async function outletOverview(outletId: string) {
  const [series, accuracy, waste, savings, donated, explanations, pendingPlan, unreadAlerts] = await Promise.all([
    salesSeries(outletId, 30),
    forecastAccuracy(outletId, 28),
    wasteSummary(outletId, 30),
    savingsEstimate(outletId),
    mealsDonated(outletId),
    nextDayExplanations(outletId),
    prisma.prepPlan.findUnique({ where: { outletId_date: { outletId, date: tomorrow() } }, select: { status: true } }),
    prisma.alert.count({ where: { outletId, isRead: false } }),
  ]);
  const revenue30 = series.reduce((s, p) => s + p.revenue, 0);
  const plates30 = series.reduce((s, p) => s + p.plates, 0);
  const revenue7 = series.slice(-7).reduce((s, p) => s + p.revenue, 0);
  const revenuePrev7 = series.slice(-14, -7).reduce((s, p) => s + p.revenue, 0);
  const wastePct = plates30 ? round((waste.plates / plates30) * 100, 1) : 0;
  // Plates avoided ≈ reduction in waste share × plates sold; fall back to 0.
  const platesAvoided = savings.baselineShare != null && savings.currentShare != null ? Math.max(0, ((savings.baselineShare - savings.currentShare) / 100) * plates30) : 0;
  return {
    series,
    accuracy,
    waste,
    savings,
    donated,
    explanations,
    revenue30: round(revenue30, 0),
    revenue7: round(revenue7, 0),
    revenueChange7: revenuePrev7 ? round(((revenue7 - revenuePrev7) / revenuePrev7) * 100, 1) : null,
    plates30,
    wastePct,
    co2AvoidedKg: co2AvoidedKg(platesAvoided),
    planPending: !pendingPlan || pendingPlan.status === "DRAFT",
    planStatus: pendingPlan?.status ?? "MISSING",
    unreadAlerts,
  };
}

export type OutletOverview = Awaited<ReturnType<typeof outletOverview>>;
