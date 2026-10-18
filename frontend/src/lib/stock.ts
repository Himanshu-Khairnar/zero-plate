import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, today } from "@/lib/dates";

/**
 * Stock maths for Module D.
 *
 * Stock on hand   = Σ IN − Σ OUT movements.
 * Batches         = IN movements with an expiry date, consumed FIFO by the OUT
 *                   total, so the oldest open batch tells us what to use first.
 * Daily usage     = plates sold in the last 14 days × recipe qty per plate / days.
 * Need (N days)   = Σ forecast.likely for the next N days × recipe qty per plate,
 *                   falling back to daily usage × N when no forecast is stored.
 * Reorder point   = daily usage × (supplier lead time + 1 day buffer).
 */

export const USAGE_WINDOW_DAYS = 14;
export const BUFFER_DAYS = 1;
export const DEFAULT_LEAD_DAYS = 2;
export const EXPIRY_SOON_DAYS = 2;

export type Batch = { date: string | null; expiryDate: string; remaining: number };

export type StockRow = {
  ingredientId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  shelfLifeDays: number;
  onHand: number;
  dailyUsage: number;
  daysOfCover: number | null;
  leadTimeDays: number;
  reorderPoint: number;
  needLead: number; // need over lead time + buffer
  status: "OK" | "LOW" | "OUT";
  nextExpiry: string | null;
  expiryState: "ok" | "soon" | "expired" | null;
  batches: Batch[];
  cheapestSupplier: { id: string; name: string; price: number; leadTimeDays: number } | null;
};

export type SuggestedOrder = {
  supplierId: string | null;
  supplierName: string | null;
  leadTimeDays: number;
  expectedDate: string;
  items: { ingredientId: string; name: string; unit: string; qty: number; unitPrice: number; onHand: number; need: number }[];
};

function roundUpQty(qty: number, unit: string): number {
  if (qty <= 0) return 0;
  if (unit === "pcs") return Math.ceil(qty);
  // kg / l: round up to a sensible pack size
  if (qty < 1) return Math.ceil(qty * 10) / 10;
  if (qty < 10) return Math.ceil(qty * 2) / 2;
  return Math.ceil(qty);
}

/** Plates sold per dish over the last `days` days (SalesRecord wins over KitchenLog per dish-day). */
async function platesSoldByDish(outletId: string, days: number): Promise<Map<string, number>> {
  const start = addDays(today(), -days);
  const [pos, kitchen] = await Promise.all([
    prisma.salesRecord.groupBy({ by: ["dishId", "date"], where: { dish: { outletId }, date: { gte: start } }, _sum: { qtySold: true } }),
    prisma.kitchenLog.findMany({ where: { outletId, date: { gte: new Date(`${start}T00:00:00Z`) }, sold: { gt: 0 } }, select: { dishId: true, date: true, sold: true } }),
  ]);
  const perDay = new Map<string, number>(); // dishId|date -> qty
  for (const r of pos) perDay.set(`${r.dishId}|${r.date}`, r._sum.qtySold ?? 0);
  for (const k of kitchen) {
    const key = `${k.dishId}|${k.date.toISOString().slice(0, 10)}`;
    if (!perDay.has(key)) perDay.set(key, 0);
    if (!pos.some((p) => p.dishId === k.dishId && p.date === k.date.toISOString().slice(0, 10))) perDay.set(key, (perDay.get(key) ?? 0) + k.sold);
  }
  const out = new Map<string, number>();
  for (const [key, qty] of perDay) {
    const dishId = key.split("|")[0];
    out.set(dishId, (out.get(dishId) ?? 0) + qty);
  }
  return out;
}

export async function stockRows(outletId: string): Promise<StockRow[]> {
  const [ingredients, movements, prices, sold, forecasts] = await Promise.all([
    prisma.ingredient.findMany({ where: { outletId }, orderBy: { name: "asc" }, include: { recipeItems: { select: { dishId: true, qtyPerPlate: true } } } }),
    prisma.stockMovement.findMany({ where: { ingredient: { outletId } }, orderBy: { createdAt: "asc" } }),
    prisma.supplierPrice.findMany({ where: { supplier: { outletId } }, include: { supplier: { select: { id: true, name: true, leadTimeDays: true } } } }),
    platesSoldByDish(outletId, USAGE_WINDOW_DAYS),
    prisma.forecast.findMany({ where: { outletId, date: { gte: today(), lte: addDays(today(), 7) } }, select: { dishId: true, date: true, likely: true } }),
  ]);

  const movesByIng = new Map<string, typeof movements>();
  for (const m of movements) movesByIng.set(m.ingredientId, [...(movesByIng.get(m.ingredientId) ?? []), m]);
  const priceByIng = new Map<string, typeof prices>();
  for (const p of prices) priceByIng.set(p.ingredientId, [...(priceByIng.get(p.ingredientId) ?? []), p]);
  const forecastByDish = new Map<string, Map<string, number>>();
  for (const f of forecasts) {
    const m = forecastByDish.get(f.dishId) ?? new Map();
    m.set(f.date, f.likely);
    forecastByDish.set(f.dishId, m);
  }
  const t = today();
  const soon = addDays(t, EXPIRY_SOON_DAYS);

  return ingredients.map((ing) => {
    const moves = movesByIng.get(ing.id) ?? [];
    const totalIn = moves.filter((m) => m.type === "IN").reduce((s, m) => s + m.qty, 0);
    const totalOut = moves.filter((m) => m.type === "OUT").reduce((s, m) => s + m.qty, 0);
    const onHand = Math.max(0, Math.round((totalIn - totalOut) * 1000) / 1000);

    // FIFO: consume OUT from the oldest IN batches (dated ones first by expiry).
    let remainingOut = totalOut;
    const batches: Batch[] = [];
    const ins = moves.filter((m) => m.type === "IN").sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
    for (const b of ins) {
      const take = Math.min(remainingOut, b.qty);
      remainingOut -= take;
      const rem = b.qty - take;
      if (rem > 0.0005 && b.expiryDate) batches.push({ date: b.createdAt.toISOString().slice(0, 10), expiryDate: b.expiryDate, remaining: Math.round(rem * 1000) / 1000 });
    }
    const nextExpiry = batches[0]?.expiryDate ?? null;
    const expiryState = !nextExpiry ? null : nextExpiry < t ? "expired" : nextExpiry <= soon ? "soon" : "ok";

    const dailyUsage = ing.recipeItems.reduce((s, r) => s + ((sold.get(r.dishId) ?? 0) / USAGE_WINDOW_DAYS) * r.qtyPerPlate, 0);
    const cheapest = (priceByIng.get(ing.id) ?? []).sort((a, b) => a.price - b.price)[0];
    const leadTimeDays = cheapest?.supplier.leadTimeDays ?? DEFAULT_LEAD_DAYS;
    const horizon = leadTimeDays + BUFFER_DAYS;
    let needLead = 0;
    for (let i = 0; i < horizon; i++) {
      const day = addDays(t, i);
      for (const r of ing.recipeItems) {
        const likely = forecastByDish.get(r.dishId)?.get(day);
        needLead += (likely ?? (sold.get(r.dishId) ?? 0) / USAGE_WINDOW_DAYS) * r.qtyPerPlate;
      }
    }
    const reorderPoint = dailyUsage * horizon;
    const status: StockRow["status"] = onHand <= 0.0005 && (dailyUsage > 0 || needLead > 0) ? "OUT" : onHand < Math.max(reorderPoint, needLead) ? "LOW" : "OK";

    return {
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit,
      costPerUnit: ing.costPerUnit,
      shelfLifeDays: ing.shelfLifeDays,
      onHand,
      dailyUsage: Math.round(dailyUsage * 1000) / 1000,
      daysOfCover: dailyUsage > 0 ? Math.round((onHand / dailyUsage) * 10) / 10 : null,
      leadTimeDays,
      reorderPoint: Math.round(reorderPoint * 1000) / 1000,
      needLead: Math.round(needLead * 1000) / 1000,
      status,
      nextExpiry,
      expiryState,
      batches,
      cheapestSupplier: cheapest ? { id: cheapest.supplier.id, name: cheapest.supplier.name, price: cheapest.price, leadTimeDays: cheapest.supplier.leadTimeDays } : null,
    };
  });
}

/** Orders needed so stock covers lead time + buffer, grouped by cheapest supplier. */
export async function suggestPurchaseOrders(outletId: string): Promise<SuggestedOrder[]> {
  const rows = await stockRows(outletId);
  const groups = new Map<string, SuggestedOrder>();
  for (const r of rows) {
    const target = Math.max(r.needLead, r.reorderPoint);
    const shortfall = target - r.onHand;
    if (shortfall <= 0.0005) continue;
    const qty = roundUpQty(shortfall, r.unit);
    if (qty <= 0) continue;
    const key = r.cheapestSupplier?.id ?? "none";
    const lead = r.cheapestSupplier?.leadTimeDays ?? DEFAULT_LEAD_DAYS;
    const group = groups.get(key) ?? {
      supplierId: r.cheapestSupplier?.id ?? null,
      supplierName: r.cheapestSupplier?.name ?? null,
      leadTimeDays: lead,
      expectedDate: addDays(today(), lead),
      items: [],
    };
    group.items.push({ ingredientId: r.ingredientId, name: r.name, unit: r.unit, qty, unitPrice: r.cheapestSupplier?.price ?? r.costPerUnit, onHand: r.onHand, need: Math.round(target * 1000) / 1000 });
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.supplierName ?? "zz").localeCompare(b.supplierName ?? "zz"));
}
