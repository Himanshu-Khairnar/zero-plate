import { z } from "zod";

import { ApiError, readJson } from "@/lib/api";
import { today } from "@/lib/dates";
import { GuardError } from "@/lib/guard";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { round } from "@/lib/prep";
import { prisma } from "@/lib/prisma";
import { WASTE_REASONS } from "@/lib/waste";
import { recordWaste, wasteValuer } from "@/lib/waste-log";

/** GET /api/mobile/waste?outletId=&limit=30 — latest entries first (limit 1–200). */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const limit = Math.min(200, Math.max(1, Math.round(Number(url.searchParams.get("limit") ?? 30)) || 30));

  const [rows, value] = await Promise.all([
    prisma.wasteLog.findMany({
      where: { outletId: outlet.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: { dish: { select: { name: true } }, ingredient: { select: { name: true } } },
    }),
    wasteValuer(outlet.id),
  ]);
  return Response.json({
    items: rows.map((w) => {
      const v = value(w);
      return {
        id: w.id,
        date: w.date,
        dishName: w.dish?.name ?? null,
        ingredientName: w.ingredient?.name ?? null,
        qty: w.qty,
        unit: v.unit,
        reason: w.reason,
        value: round(v.value, 0),
      };
    }),
  });
});

const bodySchema = z.object({
  outletId: z.string().min(1),
  dishId: z.string().min(1).nullish(),
  ingredientId: z.string().min(1).nullish(),
  qty: z.coerce.number().positive(),
  // The unit is implied (plates for a dish, the ingredient's own unit); accepted but not stored.
  unit: z.string().nullish(),
  reason: z.enum(WASTE_REASONS),
  note: z.string().max(300).nullish(),
});

/** POST /api/mobile/waste { outletId, dishId?, ingredientId?, qty, unit, reason, note? } — logged for today. */
export const POST = mobileRoute(async (req: Request) => {
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError("Please check the waste entry values.");
  const data = parsed.data;
  if (!data.dishId && !data.ingredientId) throw new ApiError("Pick a dish or an ingredient.");
  const { viewer, outlet } = await requireMobileOutlet(req, data.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");

  try {
    const { id } = await recordWaste(viewer, {
      outletId: outlet.id,
      date: today(),
      dishId: data.dishId ?? null,
      ingredientId: data.ingredientId ?? null,
      qty: data.qty,
      reason: data.reason,
      note: data.note ?? null,
    });
    return Response.json({ ok: true, id });
  } catch (err) {
    if (err instanceof GuardError) throw new ApiError(err.message, 404);
    throw err;
  }
});

export const OPTIONS = preflight;
