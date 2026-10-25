import { markAllAlertsRead } from "@/lib/alerts";
import { mobileRoute, preflight, readOptionalJson, requireMobileOutlet } from "@/lib/mobile-auth";

/** POST /api/mobile/alerts/read-all { outletId } (any role that can see the outlet). */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readOptionalJson(req);
  const { outlet } = await requireMobileOutlet(req, body.outletId);
  return Response.json({ ok: true, updated: await markAllAlertsRead(outlet.id) });
});

export const OPTIONS = preflight;
