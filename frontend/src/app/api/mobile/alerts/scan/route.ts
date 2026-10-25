import { scanAnomalies } from "@/lib/alerts";
import { mobileRoute, preflight, readOptionalJson, requireMobileOutlet } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/alerts/scan { outletId } (OWNER/MANAGER)
 * Asks the ML service to scan the last 14 days of sales for anomalies (service down gives 503).
 */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readOptionalJson(req);
  const { viewer, outlet } = await requireMobileOutlet(req, body.outletId, "OWNER", "MANAGER");
  const { created } = await scanAnomalies(viewer, outlet.id);
  return Response.json({ ok: true, created });
});

export const OPTIONS = preflight;
