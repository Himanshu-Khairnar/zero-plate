"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireOutletActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { WASTE_REASONS } from "@/lib/waste";
import { recordWaste } from "@/lib/waste-log";

const WASTE_ROLES = ["OWNER", "MANAGER", "KITCHEN_STAFF"] as const;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

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
  if (!ext) throw new GuardError("Photo must be a JPEG, PNG, WEBP or HEIC image.");
  if (file.size > MAX_PHOTO_BYTES) throw new GuardError("Photo must be 5 MB or smaller.");
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
    const row = await prisma.wasteLog.findFirst({ where: { id, outletId } });
    if (!row) throw new GuardError("Entry not found.");
    await prisma.wasteLog.delete({ where: { id } });
    await audit(viewer, "waste.delete", { outletId, entity: "WasteLog", entityId: id });
    revalidatePath("/waste-log");
  });
}

const LEFTOVER_MARKER = "auto:kitchen-leftover";

/**
 * Turn the day's kitchen-mode leftovers (prepared − sold, summed over shifts)
 * into overproduction waste rows. Safe to call repeatedly: dishes that already
 * have an auto row for that date are skipped.
 */
export async function logLeftoversFromKitchen(outletId: string, date: string) {
  return guarded(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new GuardError("Bad date.");
    const viewer = await requireOutletActor(outletId, ...WASTE_ROLES);
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
    revalidatePath("/waste-log");
    revalidatePath("/donations");
    return { created: rows.length, skipped: done.size };
  });
}

export type VisionSuggestion = { label: string; dishName?: string | null; dishId?: string | null; estimatedQty: number; confidence: number };
export type VisionResult = { items: VisionSuggestion[]; model: string; note: string };

/** Send a photo to the ML service's recognition endpoint. */
export async function recognizeWastePhoto(fd: FormData): Promise<{ ok: true; data: VisionResult } | { ok: false; error: string }> {
  const r = await guarded(async () => {
    const outletId = String(fd.get("outletId") ?? "");
    if (!outletId) throw new GuardError("outletId missing.");
    await requireOutletActor(outletId, ...WASTE_ROLES);
    const photo = fd.get("photo");
    if (!(photo instanceof File) || photo.size === 0) throw new GuardError("Attach a photo first.");
    if (!PHOTO_TYPES[photo.type]) throw new GuardError("Photo must be a JPEG, PNG, WEBP or HEIC image.");
    if (photo.size > MAX_PHOTO_BYTES) throw new GuardError("Photo must be 5 MB or smaller.");

    const base = process.env.ML_SERVICE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const body = new FormData();
    body.set("image", photo, photo.name || "photo.jpg");
    body.set("outletId", outletId);
    let res: Response;
    try {
      res = await fetch(`${base}/api/vision/recognize`, { method: "POST", body, cache: "no-store" });
    } catch {
      throw new GuardError("The recognition service is offline. Pick the dish by hand below.");
    }
    if (!res.ok) throw new GuardError(`Recognition failed (${res.status}). Pick the dish by hand below.`);
    const data = (await res.json()) as VisionResult;
    // Attach dish ids for names the service recognised so the UI can preselect them.
    const names = data.items.map((i) => i.dishName).filter((n): n is string => !!n);
    const dishes = names.length ? await prisma.dish.findMany({ where: { outletId, name: { in: names } }, select: { id: true, name: true } }) : [];
    const idByName = new Map(dishes.map((d) => [d.name, d.id]));
    return { ...data, items: data.items.map((i) => ({ ...i, dishId: i.dishName ? (idByName.get(i.dishName) ?? null) : null })) };
  });
  if (!r.ok) return r;
  return { ok: true, data: r.data as VisionResult };
}
