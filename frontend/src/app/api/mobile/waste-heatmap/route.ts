import { wasteSummary } from "@/lib/analytics";
import { clampInt, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/waste-heatmap?outletId=&days=56 (days clamped to 7-365)
 * Dish x weekday cells (weekday 0 = Monday) over the last `days` days up to yesterday.
 */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const days = clampInt(url.searchParams.get("days"), 7, 365, 56);
  const { heatmap } = await wasteSummary(outlet.id, days);
  return Response.json({ cells: heatmap });
});

export const OPTIONS = preflight;
