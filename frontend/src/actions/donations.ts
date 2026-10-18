"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireActor, requireOutletActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const ngoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80).trim(),
  city: z.string().min(1).max(60).trim(),
  contact: z.string().max(120).trim().optional(),
  address: z.string().max(200).trim().optional(),
  acceptsCooked: z.boolean().default(true),
  pickupNote: z.string().max(200).trim().optional(),
});

/** The NGO directory is shared across tenants; owners and managers may extend it. */
export async function upsertNgo(input: z.input<typeof ngoSchema>) {
  return guarded(async () => {
    const data = ngoSchema.parse(input);
    const viewer = await requireActor();
    if (!["OWNER", "MANAGER", "PLATFORM_ADMIN"].includes(viewer.role)) throw new GuardError("You do not have permission to do that.");
    const payload = { name: data.name, city: data.city, contact: data.contact || null, address: data.address || null, acceptsCooked: data.acceptsCooked, pickupNote: data.pickupNote || null };
    const row = data.id ? await prisma.ngo.update({ where: { id: data.id }, data: payload }) : await prisma.ngo.create({ data: payload });
    await audit(viewer, data.id ? "ngo.update" : "ngo.create", { entity: "Ngo", entityId: row.id, detail: row.name });
    revalidatePath("/donations");
    return { id: row.id };
  });
}

const donationSchema = z.object({
  outletId: z.string().min(1),
  ngoId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meals: z.coerce.number().int().positive(),
  dishNames: z.string().max(300).trim().optional(),
  note: z.string().max(300).trim().optional(),
});

export async function createDonation(input: z.input<typeof donationSchema>) {
  return guarded(async () => {
    const data = donationSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
    if (data.ngoId) {
      const ngo = await prisma.ngo.findUnique({ where: { id: data.ngoId } });
      if (!ngo) throw new GuardError("NGO not found.");
    }
    const row = await prisma.donation.create({
      data: { outletId: data.outletId, ngoId: data.ngoId || null, date: data.date, meals: data.meals, dishNames: data.dishNames || null, note: data.note || null, createdBy: viewer.name },
    });
    await audit(viewer, "donation.create", { outletId: data.outletId, entity: "Donation", entityId: row.id, detail: `${data.meals} meals` });
    revalidatePath("/donations");
    revalidatePath("/dashboard");
    return { id: row.id };
  });
}

export async function updateDonationStatus(outletId: string, id: string, status: "PLANNED" | "COLLECTED" | "CANCELLED") {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
    const row = await prisma.donation.findFirst({ where: { id, outletId } });
    if (!row) throw new GuardError("Donation not found.");
    await prisma.donation.update({ where: { id }, data: { status } });
    await audit(viewer, "donation.status", { outletId, entity: "Donation", entityId: id, detail: status });
    revalidatePath("/donations");
    revalidatePath("/dashboard");
  });
}

export async function deleteDonation(outletId: string, id: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER");
    const row = await prisma.donation.findFirst({ where: { id, outletId } });
    if (!row) throw new GuardError("Donation not found.");
    await prisma.donation.delete({ where: { id } });
    await audit(viewer, "donation.delete", { outletId, entity: "Donation", entityId: id });
    revalidatePath("/donations");
  });
}

export type SurplusLine = { dishId: string; dishName: string; plates: number; source: "plan" | "kitchen" };
export type SurplusEstimate = { date: string; total: number; lines: SurplusLine[] };

/**
 * Server helper (not an action): how many plates are likely to be left over on
 * `date`. Two signals, summed per dish:
 *  - the approved prep plan: plannedQty − forecastLikely (only the positive part),
 *    i.e. the cushion the manager chose to cook above expected demand;
 *  - kitchen mode: prepared − sold logged so far that day.
 * Dishes already logged as overproduction waste for that day are left out so
 * the suggestion does not double count. Meals ≈ plates.
 */
export async function suggestSurplus(outletId: string, date: string): Promise<SurplusEstimate> {
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
