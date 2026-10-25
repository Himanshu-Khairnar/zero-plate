import { ApiError, readJson } from "@/lib/api";
import { isKitchenDayLocked, lockKitchenDay } from "@/lib/kitchen";
import { mobileDate, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/kitchen/lock { outletId, date } (OWNER/MANAGER)
 * Close the day with the same rules as web kitchen mode. Already locked, nothing
 * to lock, or an invalid count (sold > prepared) gives 409.
 */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readJson(req);
  const { outlet } = await requireMobileOutlet(req, body.outletId, "OWNER", "MANAGER");
  const date = mobileDate(body.date);
  if (await isKitchenDayLocked(outlet.id, date)) throw new ApiError("This day is already locked.", 409);
  const result = await lockKitchenDay(outlet.id, date);
  if (!result.ok) throw new ApiError(result.error, 409);
  return Response.json({ ok: true });
});

export const OPTIONS = preflight;
