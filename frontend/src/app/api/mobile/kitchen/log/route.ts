import { z } from "zod";

import { ApiError, readJson } from "@/lib/api";
import { todayIsoDate } from "@/lib/date";
import { kitchenDishWhere, upsertKitchenLog } from "@/lib/kitchen";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  outletId: z.string().min(1),
  dishId: z.string().min(1),
  shift: z.enum(["LUNCH", "DINNER"]),
  prepared: z.number().int().min(0),
  sold: z.number().int().min(0),
});

/** POST /api/mobile/kitchen/log { outletId, dishId, shift, prepared, sold } — today's count for one dish and shift. */
export const POST = mobileRoute(async (req: Request) => {
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError("Invalid kitchen log input.");
  const data = parsed.data;
  const { outlet } = await requireMobileOutlet(req, data.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");

  const { organizationId } = await prisma.outlet.findUniqueOrThrow({ where: { id: outlet.id }, select: { organizationId: true } });
  const dish = await prisma.dish.findFirst({ where: { id: data.dishId, ...kitchenDishWhere(organizationId, outlet.id) }, select: { id: true } });
  if (!dish) throw new ApiError("Dish not found for this outlet.", 404);

  const result = await upsertKitchenLog({ ...data, outletId: outlet.id, date: todayIsoDate() });
  if (!result.ok) throw new ApiError(result.error, 409);
  return Response.json({ ok: true });
});

export const OPTIONS = preflight;
