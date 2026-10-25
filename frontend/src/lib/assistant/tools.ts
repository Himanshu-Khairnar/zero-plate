import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { addDays, today, tomorrow } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/**
 * Tools the AI assistant (module L) can call. Every tool runs against the
 * app's own data for one outlet, so answers come from real numbers, not
 * guesses. The same executors power the offline rule-based assistant.
 */

export type ToolContext = { outletId: string; outletName: string };

async function dishCostMap(outletId: string) {
  const dishes = await prisma.dish.findMany({ where: { outletId }, include: { recipeItems: { include: { ingredient: true } } } });
  return new Map(dishes.map((d) => [d.id, { name: d.name, price: d.price, cost: d.recipeItems.reduce((s, r) => s + r.qtyPerPlate * r.ingredient.costPerUnit, 0) }]));
}

export async function wasteSummary(ctx: ToolContext, days = 30, dish?: string) {
  const since = addDays(today(), -days + 1);
  const logs = await prisma.wasteLog.findMany({ where: { outletId: ctx.outletId, date: { gte: since }, ...(dish ? { dish: { name: { contains: dish, mode: "insensitive" } } } : {}) }, include: { dish: true, ingredient: true } });
  const costs = await dishCostMap(ctx.outletId);
  const byDish = new Map<string, { plates: number; cost: number }>();
  const byReason = new Map<string, number>();
  let totalCost = 0;
  for (const l of logs) {
    const cost = l.dishId ? l.qty * (costs.get(l.dishId)?.cost ?? 0) : l.qty * (l.ingredient?.costPerUnit ?? 0);
    totalCost += cost;
    byReason.set(l.reason, (byReason.get(l.reason) ?? 0) + l.qty);
    const key = l.dish?.name ?? l.ingredient?.name ?? "unknown";
    const cur = byDish.get(key) ?? { plates: 0, cost: 0 };
    byDish.set(key, { plates: cur.plates + l.qty, cost: cur.cost + cost });
  }
  const top = [...byDish.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 5).map(([name, v]) => ({ name, qty: Math.round(v.plates), cost: Math.round(v.cost) }));
  return { days, since, entries: logs.length, totalCost: Math.round(totalCost), byReason: Object.fromEntries(byReason), top };
}

export async function salesSummary(ctx: ToolContext, days = 7, dish?: string) {
  const since = addDays(today(), -days + 1);
  const rows = await prisma.salesRecord.findMany({ where: { dish: { outletId: ctx.outletId, ...(dish ? { name: { contains: dish, mode: "insensitive" } } : {}) }, date: { gte: since } }, include: { dish: { select: { name: true } } } });
  const byDish = new Map<string, { plates: number; revenue: number }>();
  let plates = 0, revenue = 0;
  for (const r of rows) {
    plates += r.qtySold; revenue += r.qtySold * r.price;
    const cur = byDish.get(r.dish.name) ?? { plates: 0, revenue: 0 };
    byDish.set(r.dish.name, { plates: cur.plates + r.qtySold, revenue: cur.revenue + r.qtySold * r.price });
  }
  const top = [...byDish.entries()].sort((a, b) => b[1].plates - a[1].plates).slice(0, 5).map(([name, v]) => ({ name, plates: v.plates, revenue: Math.round(v.revenue) }));
  return { days, since, plates, revenue: Math.round(revenue), perDay: Math.round(plates / days), top };
}

export async function forecastFor(ctx: ToolContext, start?: string, days = 1, dish?: string) {
  const s = start ?? tomorrow();
  const rows = await prisma.forecast.findMany({ where: { outletId: ctx.outletId, date: { gte: s, lte: addDays(s, days - 1) }, ...(dish ? { dish: { name: { contains: dish, mode: "insensitive" } } } : {}) }, include: { dish: { select: { name: true } } }, orderBy: [{ date: "asc" }, { likely: "desc" }] });
  return { start: s, days, rows: rows.map((r) => ({ date: r.date, dish: r.dish.name, low: Math.round(r.low), likely: Math.round(r.likely), high: Math.round(r.high), why: r.explanation })) };
}

export async function stockLevels(ctx: ToolContext, ingredient?: string) {
  const items = await prisma.ingredient.findMany({ where: { outletId: ctx.outletId, ...(ingredient ? { name: { contains: ingredient, mode: "insensitive" } } : {}) }, include: { stockMovements: true } });
  return items.map((i) => {
    const onHand = i.stockMovements.reduce((s, m) => s + (m.type === "IN" ? m.qty : -m.qty), 0);
    const nextExpiry = i.stockMovements.filter((m) => m.type === "IN" && m.expiryDate && m.expiryDate >= today()).map((m) => m.expiryDate!).sort()[0] ?? null;
    return { ingredient: i.name, unit: i.unit, onHand: Math.round(onHand * 100) / 100, nextExpiry, costPerUnit: i.costPerUnit };
  });
}

export async function orderSuggestion(ctx: ToolContext, ingredient: string, days = 2) {
  const ing = await prisma.ingredient.findFirst({ where: { outletId: ctx.outletId, name: { contains: ingredient, mode: "insensitive" } }, include: { recipeItems: true, stockMovements: true } });
  if (!ing) return { error: `No ingredient matching "${ingredient}" at ${ctx.outletName}.` };
  const onHand = ing.stockMovements.reduce((s, m) => s + (m.type === "IN" ? m.qty : -m.qty), 0);
  const forecasts = await prisma.forecast.findMany({ where: { outletId: ctx.outletId, date: { gte: tomorrow(), lte: addDays(tomorrow(), days - 1) }, dishId: { in: ing.recipeItems.map((r) => r.dishId) } } });
  const perDish = new Map(ing.recipeItems.map((r) => [r.dishId, r.qtyPerPlate]));
  const need = forecasts.reduce((s, f) => s + f.high * (perDish.get(f.dishId) ?? 0), 0);
  const order = Math.max(0, need - onHand);
  return { ingredient: ing.name, unit: ing.unit, onHand: round2(onHand), needForDays: days, need: round2(need), suggestedOrder: round2(order), basis: "high forecast × recipe quantity, minus stock on hand" };
}

export async function prepPlanFor(ctx: ToolContext, date?: string) {
  const d = date ?? tomorrow();
  const plan = await prisma.prepPlan.findUnique({ where: { outletId_date: { outletId: ctx.outletId, date: d } }, include: { items: { include: { dish: true } } } });
  if (!plan) return { date: d, status: "not drafted yet" };
  return { date: d, status: plan.status, approvedBy: plan.approvedBy, items: plan.items.map((i) => ({ dish: i.dish.name, plates: i.plannedQty, likely: Math.round(i.forecastLikely) })) };
}

/** Dish and ingredient names of the outlet, sent to the NLP parser as its gazetteer. */
export async function outletVocabulary(ctx: ToolContext): Promise<{ dishes: string[]; ingredients: string[] }> {
  const [dishes, ingredients] = await Promise.all([
    prisma.dish.findMany({ where: { outletId: ctx.outletId }, select: { name: true } }),
    prisma.ingredient.findMany({ where: { outletId: ctx.outletId }, select: { name: true } }),
  ]);
  return { dishes: dishes.map((d) => d.name), ingredients: ingredients.map((i) => i.name) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const TOOL_DEFS: Anthropic.Tool[] = [
  { name: "get_waste_summary", description: "Waste logged at this outlet: total cost, split by reason, and the most wasted dishes. Use for any question about waste.", input_schema: { type: "object", properties: { days: { type: "integer", description: "Look-back window in days, default 30" }, dish: { type: "string", description: "Optional dish name filter" } }, additionalProperties: false } },
  { name: "get_sales_summary", description: "Plates sold and revenue over the last N days, with the top dishes.", input_schema: { type: "object", properties: { days: { type: "integer" }, dish: { type: "string" } }, additionalProperties: false } },
  { name: "get_forecast", description: "Demand forecast per dish (low / likely / high plates) for upcoming days, with the plain-language reason.", input_schema: { type: "object", properties: { start: { type: "string", description: "YYYY-MM-DD, default tomorrow" }, days: { type: "integer", description: "1-7" }, dish: { type: "string" } }, additionalProperties: false } },
  { name: "get_stock", description: "Current stock on hand per ingredient and next expiry date.", input_schema: { type: "object", properties: { ingredient: { type: "string" } }, additionalProperties: false } },
  { name: "suggest_order", description: "How much of an ingredient to order for the coming days, from the forecast and recipes minus stock on hand.", input_schema: { type: "object", properties: { ingredient: { type: "string" }, days: { type: "integer", description: "Days to cover, default 2" } }, required: ["ingredient"], additionalProperties: false } },
  { name: "get_prep_plan", description: "The prep plan for a day: status and plates per dish.", input_schema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD, default tomorrow" } }, additionalProperties: false } },
];

export async function runTool(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<unknown> {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const int = (k: string, d: number) => (Number.isFinite(Number(input[k])) && Number(input[k]) > 0 ? Math.min(90, Math.floor(Number(input[k]))) : d);
  switch (name) {
    case "get_waste_summary": return wasteSummary(ctx, int("days", 30), str("dish"));
    case "get_sales_summary": return salesSummary(ctx, int("days", 7), str("dish"));
    case "get_forecast": return forecastFor(ctx, str("start"), Math.min(7, int("days", 1)), str("dish"));
    case "get_stock": return stockLevels(ctx, str("ingredient"));
    case "suggest_order": return orderSuggestion(ctx, str("ingredient") ?? "", int("days", 2));
    case "get_prep_plan": return prepPlanFor(ctx, str("date"));
    default: return { error: `Unknown tool ${name}` };
  }
}
