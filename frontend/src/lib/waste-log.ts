import "server-only";

import { dishCostMap } from "@/lib/analytics";
import { audit, GuardError } from "@/lib/guard";
import type { Viewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { wasteKgOf, type WasteReason } from "@/lib/waste";
import { photoProblem, recognitionFailureStatus } from "@/lib/waste-photo";

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

/** Delete one waste entry of the outlet (404 if it is not there). Callers check access and role. */
export async function deleteWasteEntry(viewer: Viewer, outletId: string, id: string): Promise<void> {
  const row = await prisma.wasteLog.findFirst({ where: { id, outletId } });
  if (!row) throw new GuardError("Entry not found.", 404);
  await prisma.wasteLog.delete({ where: { id } });
  await audit(viewer, "waste.delete", { outletId, entity: "WasteLog", entityId: id });
}

export const LEFTOVER_MARKER = "auto:kitchen-leftover";

/**
 * Turn the day's kitchen-mode leftovers (prepared − sold, summed over shifts)
 * into overproduction waste rows. Safe to call repeatedly: dishes that already
 * have an auto row for that date are skipped. Callers check access and role.
 */
export async function logKitchenLeftovers(viewer: Viewer, outletId: string, date: string): Promise<{ created: number; skipped: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new GuardError("Bad date.");
  const day = new Date(`${date}T00:00:00.000Z`);
  const logs = await prisma.kitchenLog.groupBy({
    by: ["dishId"],
    where: { outletId, date: day },
    _sum: { prepared: true, sold: true },
  });
  const existing = await prisma.wasteLog.findMany({
    where: { outletId, date, reason: "overproduction", note: LEFTOVER_MARKER },
    select: { dishId: true },
  });
  const done = new Set(existing.map((e) => e.dishId));
  const rows = logs
    .map((l) => ({ dishId: l.dishId, leftover: (l._sum.prepared ?? 0) - (l._sum.sold ?? 0) }))
    .filter((l) => l.leftover > 0 && !done.has(l.dishId));
  if (rows.length) {
    await prisma.wasteLog.createMany({
      data: rows.map((r) => ({
        outletId,
        dishId: r.dishId,
        date,
        qty: r.leftover,
        reason: "overproduction",
        note: LEFTOVER_MARKER,
        loggedBy: viewer.name,
      })),
    });
    await audit(viewer, "waste.leftovers", { outletId, entity: "WasteLog", detail: `${rows.length} dishes for ${date}` });
  }
  return { created: rows.length, skipped: done.size };
}

export type VisionSuggestion = { label: string; dishName?: string | null; dishId?: string | null; estimatedQty: number; confidence: number };
export type VisionResult = { items: VisionSuggestion[]; model: string; note: string };

/**
 * Send a photo to the ML service's recognition endpoint and attach dish ids for
 * the names it recognised. Bad photo → GuardError 400; service down → 503;
 * image rejected by the service → 422. Callers check access and role.
 */
export async function recognizeWaste(outletId: string, photo: unknown): Promise<VisionResult> {
  const problem = photoProblem(photo);
  if (problem) throw new GuardError(problem);
  const file = photo as File;

  const base = process.env.ML_SERVICE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const body = new FormData();
  body.set("image", file, file.name || "photo.jpg");
  body.set("outletId", outletId);
  let res: Response;
  try {
    res = await fetch(`${base}/api/vision/recognize`, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new GuardError("The recognition service is offline. Pick the dish by hand below.", recognitionFailureStatus(null));
  }
  if (!res.ok) throw new GuardError(`Recognition failed (${res.status}). Pick the dish by hand below.`, recognitionFailureStatus(res.status));
  let data: VisionResult;
  try {
    data = (await res.json()) as VisionResult;
  } catch {
    throw new GuardError("The recognition service sent an unreadable reply. Pick the dish by hand below.", 503);
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  // Attach dish ids for names the service recognised so the UI can preselect them.
  const names = items.map((i) => i.dishName).filter((n): n is string => !!n);
  const dishes = names.length ? await prisma.dish.findMany({ where: { outletId, name: { in: names } }, select: { id: true, name: true } }) : [];
  const idByName = new Map(dishes.map((d) => [d.name, d.id]));
  return { ...data, items: items.map((i) => ({ ...i, dishId: i.dishName ? (idByName.get(i.dishName) ?? null) : null })) };
}
