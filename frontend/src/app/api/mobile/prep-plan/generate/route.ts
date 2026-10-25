import { readJson } from "@/lib/api";
import { mobileDate, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { generatePlan } from "@/lib/prep-plans";

/**
 * POST /api/mobile/prep-plan/generate { outletId, date } (OWNER/MANAGER)
 * Get-or-create the day's plan; a plan still in DRAFT is rebuilt from fresh forecasts
 * (may call the ML service: unreachable gives 503).
 */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readJson(req);
  const { outlet } = await requireMobileOutlet(req, body.outletId, "OWNER", "MANAGER");
  const date = mobileDate(body.date);
  return Response.json({ plan: await generatePlan(outlet.id, date) });
});

export const OPTIONS = preflight;
