import { ApiError } from "@/lib/api";
import { todayIsoDate } from "@/lib/date";
import { isIsoDate } from "@/lib/dates";
import { kitchenDaySummary } from "@/lib/kitchen";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

/** GET /api/mobile/kitchen?outletId=&date= — per-dish totals over both shifts (date defaults to today, as in kitchen mode). */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const date = url.searchParams.get("date") || todayIsoDate();
  if (!isIsoDate(date)) throw new ApiError("date must be YYYY-MM-DD.");
  return Response.json(await kitchenDaySummary(outlet.id, date));
});

export const OPTIONS = preflight;
