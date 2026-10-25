"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guarded, GuardError, requireOutletActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { WASTE_REASONS } from "@/lib/waste";
import { deleteWasteEntry, logKitchenLeftovers, recognizeWaste, recordWaste, type VisionResult } from "@/lib/waste-log";
import { MAX_PHOTO_BYTES, PHOTO_SIZE_ERROR, PHOTO_TYPE_ERROR, PHOTO_TYPES } from "@/lib/waste-photo";

export type { VisionResult, VisionSuggestion } from "@/lib/waste-log";

const WASTE_ROLES = ["OWNER", "MANAGER", "KITCHEN_STAFF"] as const;

const logSchema = z.object({
  outletId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dishId: z.string().optional(),
  ingredientId: z.string().optional(),
  qty: z.coerce.number().positive(),
  reason: z.enum(WASTE_REASONS),
  note: z.string().max(300).optional(),
  aiLabel: z.string().max(80).optional(),
  aiConfidence: z.coerce.number().min(0).max(1).optional(),
});

/**
 * Photos are written under public/uploads/waste in development. Production
 * swaps this for S3-compatible storage (Supabase Storage per the plan): keep
 * the returned URL shape and only change this function.
 */
async function storePhoto(file: File): Promise<string> {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new GuardError(PHOTO_TYPE_ERROR);
  if (file.size > MAX_PHOTO_BYTES) throw new GuardError(PHOTO_SIZE_ERROR);
  const name = `${randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "waste");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/waste/${name}`;
}

function fieldsFromForm(fd: FormData): Record<string, string | undefined> {
  const get = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  return {
    outletId: get("outletId"),
    date: get("date"),
    dishId: get("dishId"),
    ingredientId: get("ingredientId"),
    qty: get("qty"),
    reason: get("reason"),
    note: get("note"),
    aiLabel: get("aiLabel"),
    aiConfidence: get("aiConfidence"),
  };
}

/** Log one waste entry. Accepts FormData (with optional `photo` File) or a plain object. */
export async function logWaste(input: FormData | z.input<typeof logSchema>) {
  return guarded(async () => {
    const raw = input instanceof FormData ? fieldsFromForm(input) : input;
    const data = logSchema.parse(raw);
    if (!data.dishId && !data.ingredientId) throw new GuardError("Pick a dish or an ingredient.");
    const viewer = await requireOutletActor(data.outletId, ...WASTE_ROLES);

    if (data.dishId) {
      const dish = await prisma.dish.findFirst({ where: { id: data.dishId, outletId: data.outletId } });
      if (!dish) throw new GuardError("Dish not found for this outlet.");
    }
    if (data.ingredientId) {
      const ing = await prisma.ingredient.findFirst({ where: { id: data.ingredientId, outletId: data.outletId } });
      if (!ing) throw new GuardError("Ingredient not found for this outlet.");
    }

    // Validate the dish/ingredient before storing a photo, so a bad request leaves no orphan file.
    let photoUrl: string | undefined;
    if (input instanceof FormData) {
      const photo = input.get("photo");
      if (photo instanceof File && photo.size > 0) photoUrl = await storePhoto(photo);
    }

    const row = await recordWaste(viewer, { ...data, photoUrl });
    revalidatePath("/waste-log");
    revalidatePath("/kitchen/waste");
    revalidatePath("/donations");
    revalidatePath("/analytics");
    return { id: row.id };
  });
}

export async function deleteWasteLog(outletId: string, id: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER");
    await deleteWasteEntry(viewer, outletId, id);
    revalidatePath("/waste-log");
  });
}

/**
 * Turn the day's kitchen-mode leftovers into overproduction waste rows
 * (see `logKitchenLeftovers`). Safe to call repeatedly.
 */
export async function logLeftoversFromKitchen(outletId: string, date: string) {
  return guarded(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new GuardError("Bad date.");
    const viewer = await requireOutletActor(outletId, ...WASTE_ROLES);
    const result = await logKitchenLeftovers(viewer, outletId, date);
    revalidatePath("/waste-log");
    revalidatePath("/donations");
    return result;
  });
}

/** Send a photo to the ML service's recognition endpoint. */
export async function recognizeWastePhoto(fd: FormData): Promise<{ ok: true; data: VisionResult } | { ok: false; error: string }> {
  const r = await guarded(async () => {
    const outletId = String(fd.get("outletId") ?? "");
    if (!outletId) throw new GuardError("outletId missing.");
    await requireOutletActor(outletId, ...WASTE_ROLES);
    return recognizeWaste(outletId, fd.get("photo"));
  });
  if (!r.ok) return r;
  return { ok: true, data: r.data as VisionResult };
}
