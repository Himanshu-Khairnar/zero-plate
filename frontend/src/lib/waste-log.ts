import "server-only";

import { dishCostMap } from "@/lib/analytics";
import { audit, GuardError } from "@/lib/guard";
import type { Viewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { wasteKgOf, type WasteReason } from "@/lib/waste";

/**
 * Module H core: write one waste entry. Shared by the `logWaste` server action
 * and the mobile API. Callers check outlet access and validate input first;
 * a dish/ingredient that does not belong to the outlet raises GuardError.
 */
export type WasteEntryInput = {
  outletId: string;
  date: string; // YYYY-MM-DD
  dishId?: string | null;
  ingredientId?: string | null;
  qty: number;
  reason: WasteReason;
  note?: string | null;
  photoUrl?: string | null;
  aiLabel?: string | null;
  aiConfidence?: number | null;
};

export async function recordWaste(viewer: Viewer, data: WasteEntryInput): Promise<{ id: string }> {
  if (!data.dishId && !data.ingredientId) throw new GuardError("Pick a dish or an ingredient.");
  if (data.dishId) {
    const dish = await prisma.dish.findFirst({ where: { id: data.dishId, outletId: data.outletId } });
    if (!dish) throw new GuardError("Dish not found for this outlet.");
  }
  if (data.ingredientId) {
    const ing = await prisma.ingredient.findFirst({ where: { id: data.ingredientId, outletId: data.outletId } });
    if (!ing) throw new GuardError("Ingredient not found for this outlet.");
  }

  const row = await prisma.wasteLog.create({
    data: {
      outletId: data.outletId,
      dishId: data.dishId ?? null,
      ingredientId: data.ingredientId ?? null,
      date: data.date,
      qty: data.qty,
      reason: data.reason,
      note: data.note ?? null,
      photoUrl: data.photoUrl ?? null,
      aiLabel: data.aiLabel ?? null,
      aiConfidence: data.aiConfidence ?? null,
      loggedBy: viewer.name,
    },
  });
  await audit(viewer, "waste.log", { outletId: data.outletId, entity: "WasteLog", entityId: row.id, detail: `${data.qty} ${data.reason}` });
  return { id: row.id };
}

/**
 * Unit, value (₹) and approximate kg for waste rows of an outlet. Dish rows are
 * plates at the recipe cost per plate; ingredient rows use the ingredient's
 * unit and cost per unit (same costing as the analytics page).
 */
export async function wasteValuer(outletId: string) {
  const [{ cost }, ingredients] = await Promise.all([
    dishCostMap(outletId),
    prisma.ingredient.findMany({ where: { outletId }, select: { id: true, unit: true, costPerUnit: true } }),
  ]);
  const ingredient = new Map(ingredients.map((i) => [i.id, i]));
  return (w: { dishId: string | null; ingredientId: string | null; qty: number }) => {
    if (w.dishId) return { unit: "plates", value: w.qty * (cost.get(w.dishId) ?? 0), kg: wasteKgOf(w.qty, "plates") };
    const ing = w.ingredientId ? ingredient.get(w.ingredientId) : undefined;
    return { unit: ing?.unit ?? "", value: w.qty * (ing?.costPerUnit ?? 0), kg: wasteKgOf(w.qty, ing?.unit) };
  };
}
