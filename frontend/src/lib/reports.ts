import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, isoDate, today } from "@/lib/dates";
import { costPerPlate, round } from "@/lib/prep";

export type Period = { start: string; end: string };

export type ReportDay = { date: string; plates: number; revenue: number; wastePlates: number; wasteCost: number };
export type ReportDish = { dishId: string; name: string; category: string; plates: number; revenue: number; wastePlates: number; wasteCost: number };
export type ReportWaste = { reason: string; qty: number; cost: number; entries: number };
export type ReportAccuracyDay = { date: string; forecast: number; actual: number; absError: number; inside: number; total: number };
export type ReportAdherence = { date: string; planned: number; sold: number; status: string };

export type Report = {
  outlet: { id: string; name: string; city: string };
  period: Period;
  generatedAt: string;
  totals: {
    plates: number;
    revenue: number;
    wastePlates: number;
    wasteCost: number;
    wasteSharePct: number | null;
    forecastMape: number | null;
    forecastCoverage: number | null;
    mealsDonated: number;
    days: number;
  };
  days: ReportDay[];
  dishes: ReportDish[];
  waste: ReportWaste[];
  topWasted: ReportDish[];
  accuracy: ReportAccuracyDay[];
  adherence: ReportAdherence[];
};

export function lastWeek(): Period {
  const end = addDays(today(), -1);
  return { start: addDays(end, -6), end };
}

export function lastMonth(): Period {
  const end = addDays(today(), -1);
  return { start: addDays(end, -29), end };
}

function dateRange(p: Period): string[] {
  const out: string[] = [];
  for (let d = p.start; d <= p.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Sales per dish per day: SalesRecord rows win; KitchenLog "sold" fills days without them. */
async function salesByDishDay(outletId: string, p: Period, dishPrice: Map<string, number>) {
  const [pos, kitchen] = await Promise.all([
    prisma.salesRecord.groupBy({
      by: ["dishId", "date"],
      where: { dish: { outletId }, date: { gte: p.start, lte: p.end } },
      _sum: { qtySold: true },
      _avg: { price: true },
    }),
    prisma.kitchenLog.groupBy({
      by: ["dishId", "date"],
      where: { outletId, date: { gte: new Date(`${p.start}T00:00:00Z`), lte: new Date(`${p.end}T00:00:00Z`) } },
      _sum: { sold: true },
    }),
  ]);
  const map = new Map<string, { dishId: string; date: string; qty: number; revenue: number }>();
  for (const r of pos) {
    const qty = r._sum.qtySold ?? 0;
    map.set(`${r.dishId}|${r.date}`, { dishId: r.dishId, date: r.date, qty, revenue: qty * (r._avg.price ?? dishPrice.get(r.dishId) ?? 0) });
  }
  for (const k of kitchen) {
    const date = isoDate(new Date(k.date.getTime() + k.date.getTimezoneOffset() * 60000));
    const key = `${k.dishId}|${date}`;
    if (map.has(key)) continue;
    const qty = k._sum.sold ?? 0;
    if (qty > 0) map.set(key, { dishId: k.dishId, date, qty, revenue: qty * (dishPrice.get(k.dishId) ?? 0) });
  }
  return [...map.values()];
}

export async function buildReport(outletId: string, period: Period): Promise<Report> {
  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { id: true, name: true, city: true } });
  const dishes = await prisma.dish.findMany({
    where: { outletId },
    include: { recipeItems: { include: { ingredient: { select: { costPerUnit: true } } } } },
  });
  const dishPrice = new Map(dishes.map((d) => [d.id, d.price]));
  const dishCost = new Map(dishes.map((d) => [d.id, costPerPlate(d.recipeItems.map((r) => ({ qtyPerPlate: r.qtyPerPlate, costPerUnit: r.ingredient.costPerUnit })))]));
  const dishMeta = new Map(dishes.map((d) => [d.id, { name: d.name, category: d.category }]));

  const [sales, wasteLogs, forecasts, plans, donations] = await Promise.all([
    salesByDishDay(outletId, period, dishPrice),
    prisma.wasteLog.findMany({ where: { outletId, date: { gte: period.start, lte: period.end } }, include: { ingredient: { select: { costPerUnit: true, name: true } } } }),
    prisma.forecast.findMany({ where: { outletId, date: { gte: period.start, lte: period.end } } }),
    prisma.prepPlan.findMany({ where: { outletId, date: { gte: period.start, lte: period.end } }, include: { items: true } }),
    prisma.donation.aggregate({ where: { outletId, status: "COLLECTED", date: { gte: period.start, lte: period.end } }, _sum: { meals: true } }),
  ]);

  const days = new Map<string, ReportDay>(dateRange(period).map((d) => [d, { date: d, plates: 0, revenue: 0, wastePlates: 0, wasteCost: 0 }]));
  const perDish = new Map<string, ReportDish>();
  const dishRow = (id: string) => {
    let r = perDish.get(id);
    if (!r) {
      const m = dishMeta.get(id);
      r = { dishId: id, name: m?.name ?? "Unknown dish", category: m?.category ?? "", plates: 0, revenue: 0, wastePlates: 0, wasteCost: 0 };
      perDish.set(id, r);
    }
    return r;
  };
  const soldByDishDay = new Map<string, number>();
  for (const s of sales) {
    const day = days.get(s.date);
    if (day) { day.plates += s.qty; day.revenue += s.revenue; }
    const r = dishRow(s.dishId);
    r.plates += s.qty;
    r.revenue += s.revenue;
    soldByDishDay.set(`${s.dishId}|${s.date}`, s.qty);
  }

  const wasteByReason = new Map<string, ReportWaste>();
  for (const w of wasteLogs) {
    const cost = w.dishId ? w.qty * (dishCost.get(w.dishId) ?? 0) : w.qty * (w.ingredient?.costPerUnit ?? 0);
    const plates = w.dishId ? w.qty : 0;
    const day = days.get(w.date);
    if (day) { day.wastePlates += plates; day.wasteCost += cost; }
    if (w.dishId) { const r = dishRow(w.dishId); r.wastePlates += plates; r.wasteCost += cost; }
    const reason = wasteByReason.get(w.reason) ?? { reason: w.reason, qty: 0, cost: 0, entries: 0 };
    reason.qty += w.qty; reason.cost += cost; reason.entries += 1;
    wasteByReason.set(w.reason, reason);
  }

  const accuracyByDay = new Map<string, ReportAccuracyDay>();
  let apeSum = 0, apeN = 0, inside = 0, total = 0;
  const yesterday = addDays(today(), -1);
  for (const f of forecasts) {
    if (f.date > yesterday) continue;
    const actual = soldByDishDay.get(`${f.dishId}|${f.date}`);
    if (actual === undefined) continue;
    const row = accuracyByDay.get(f.date) ?? { date: f.date, forecast: 0, actual: 0, absError: 0, inside: 0, total: 0 };
    row.forecast += f.likely; row.actual += actual; row.absError += Math.abs(f.likely - actual); row.total += 1;
    if (actual >= f.low && actual <= f.high) row.inside += 1;
    accuracyByDay.set(f.date, row);
    if (actual > 0) { apeSum += Math.abs(f.likely - actual) / actual; apeN += 1; }
    total += 1;
    if (actual >= f.low && actual <= f.high) inside += 1;
  }

  const adherence: ReportAdherence[] = plans
    .map((p) => ({
      date: p.date,
      planned: p.items.reduce((s, i) => s + i.plannedQty, 0),
      sold: p.items.reduce((s, i) => s + (soldByDishDay.get(`${i.dishId}|${p.date}`) ?? 0), 0),
      status: p.status,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const dayList = [...days.values()].map((d) => ({ ...d, revenue: round(d.revenue), wasteCost: round(d.wasteCost), wastePlates: round(d.wastePlates, 1) }));
  const dishList = [...perDish.values()].map((d) => ({ ...d, revenue: round(d.revenue), wasteCost: round(d.wasteCost), wastePlates: round(d.wastePlates, 1) })).sort((a, b) => b.revenue - a.revenue);
  const plates = dayList.reduce((s, d) => s + d.plates, 0);
  const wastePlates = round(dayList.reduce((s, d) => s + d.wastePlates, 0), 1);

  return {
    outlet,
    period,
    generatedAt: new Date().toISOString(),
    totals: {
      plates,
      revenue: round(dayList.reduce((s, d) => s + d.revenue, 0)),
      wastePlates,
      wasteCost: round(dayList.reduce((s, d) => s + d.wasteCost, 0)),
      wasteSharePct: plates + wastePlates > 0 ? round((wastePlates / (plates + wastePlates)) * 100, 1) : null,
      forecastMape: apeN ? round((apeSum / apeN) * 100, 1) : null,
      forecastCoverage: total ? round((inside / total) * 100, 0) : null,
      mealsDonated: donations._sum.meals ?? 0,
      days: dayList.length,
    },
    days: dayList,
    dishes: dishList,
    waste: [...wasteByReason.values()].map((w) => ({ ...w, qty: round(w.qty, 1), cost: round(w.cost) })).sort((a, b) => b.cost - a.cost),
    topWasted: [...dishList].filter((d) => d.wastePlates > 0).sort((a, b) => b.wasteCost - a.wasteCost).slice(0, 5),
    accuracy: [...accuracyByDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((a) => ({ ...a, forecast: round(a.forecast), absError: round(a.absError) })),
    adherence,
  };
}
