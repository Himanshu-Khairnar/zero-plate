import "server-only";

import { z } from "zod";

import { audit, GuardError } from "@/lib/guard";
import type { Viewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

/**
 * Module J core: donations and the surplus estimate. Shared by the donation
 * server actions (Auth.js session) and the mobile API (bearer token). Callers
 * check outlet access and role first.
 */

export const DONATION_STATUSES = ["PLANNED", "COLLECTED", "CANCELLED"] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

export const donationSchema = z.object({
  outletId: z.string().min(1),
  ngoId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meals: z.coerce.number().int().positive(),
  dishNames: z.string().max(300).trim().optional(),
  note: z.string().max(300).trim().optional(),
});
export type DonationInput = z.output<typeof donationSchema>;

export async function recordDonation(viewer: Viewer, data: DonationInput): Promise<{ id: string }> {
  if (data.ngoId) {
    const ngo = await prisma.ngo.findUnique({ where: { id: data.ngoId } });
    if (!ngo) throw new GuardError("NGO not found.", 404);
  }
  const row = await prisma.donation.create({
    data: { outletId: data.outletId, ngoId: data.ngoId || null, date: data.date, meals: data.meals, dishNames: data.dishNames || null, note: data.note || null, createdBy: viewer.name },
  });
  await audit(viewer, "donation.create", { outletId: data.outletId, entity: "Donation", entityId: row.id, detail: `${data.meals} meals` });
  return { id: row.id };
}

export async function setDonationStatus(viewer: Viewer, outletId: string, id: string, status: DonationStatus): Promise<void> {
  const row = await prisma.donation.findFirst({ where: { id, outletId } });
  if (!row) throw new GuardError("Donation not found.", 404);
  await prisma.donation.update({ where: { id }, data: { status } });
  await audit(viewer, "donation.status", { outletId, entity: "Donation", entityId: id, detail: status });
}

/** The NGO directory (shared across tenants), ordered as on the web donations page. */
export function listNgos() {
  return prisma.ngo.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }] });
}

export type SurplusLine = { dishId: string; dishName: string; plates: number; source: "plan" | "kitchen" };
export type SurplusEstimate = { date: string; total: number; lines: SurplusLine[] };

/**
 * How many plates are likely to be left over on `date`. Two signals, summed per dish:
 *  - the approved prep plan: plannedQty − forecastLikely (only the positive part),
 *    i.e. the cushion the manager chose to cook above expected demand;
 *  - kitchen mode: prepared − sold logged so far that day.
 * Dishes already logged as overproduction waste for that day are left out so
 * the suggestion does not double count. Meals ≈ plates.
 */
export async function estimateSurplus(outletId: string, date: string): Promise<SurplusEstimate> {
  const day = new Date(`${date}T00:00:00.000Z`);
  const [plan, kitchen, wasted] = await Promise.all([
    prisma.prepPlan.findUnique({ where: { outletId_date: { outletId, date } }, include: { items: { include: { dish: { select: { name: true } } } } } }),
    prisma.kitchenLog.groupBy({ by: ["dishId"], where: { outletId, date: day }, _sum: { prepared: true, sold: true } }),
    prisma.wasteLog.findMany({ where: { outletId, date, reason: "overproduction", dishId: { not: null } }, select: { dishId: true } }),
  ]);
  const alreadyWasted = new Set(wasted.map((w) => w.dishId));
  const byDish = new Map<string, SurplusLine>();

  if (plan && plan.status !== "DRAFT") {
    for (const i of plan.items) {
      const cushion = Math.round(i.plannedQty - i.forecastLikely);
      if (cushion > 0 && !alreadyWasted.has(i.dishId)) byDish.set(i.dishId, { dishId: i.dishId, dishName: i.dish.name, plates: cushion, source: "plan" });
    }
  }
  if (kitchen.length) {
    const names = await prisma.dish.findMany({ where: { id: { in: kitchen.map((k) => k.dishId) } }, select: { id: true, name: true } });
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    for (const k of kitchen) {
      const leftover = (k._sum.prepared ?? 0) - (k._sum.sold ?? 0);
      if (leftover <= 0 || alreadyWasted.has(k.dishId)) continue;
      // Kitchen numbers are real counts; they supersede the plan's estimate.
      byDish.set(k.dishId, { dishId: k.dishId, dishName: nameOf.get(k.dishId) ?? "Dish", plates: leftover, source: "kitchen" });
    }
  }
  const lines = [...byDish.values()].sort((a, b) => b.plates - a.plates);
  return { date, total: lines.reduce((s, l) => s + l.plates, 0), lines };
}
