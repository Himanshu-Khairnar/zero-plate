import { readJson } from "@/lib/api";
import { mobileDate, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { logKitchenLeftovers } from "@/lib/waste-log";

/**
 * POST /api/mobile/kitchen/leftovers { outletId, date } (OWNER/MANAGER/KITCHEN_STAFF)
 * The day's kitchen leftovers (prepared minus sold) become overproduction waste rows,
 * exactly like the web; dishes already logged for that day are skipped.
 */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readJson(req);
  const { viewer, outlet } = await requireMobileOutlet(req, body.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
  const date = mobileDate(body.date);
  const { created } = await logKitchenLeftovers(viewer, outlet.id, date);
  return Response.json({ ok: true, logged: created });
});

export const OPTIONS = preflight;
