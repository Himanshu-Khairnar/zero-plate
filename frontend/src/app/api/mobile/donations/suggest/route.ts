import { today } from "@/lib/dates";
import { estimateSurplus } from "@/lib/donations";
import { mobileDate, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

/** GET /api/mobile/donations/suggest?outletId=&date= (date defaults to today), returns `SurplusEstimate`. */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const date = mobileDate(url.searchParams.get("date"), today());
  return Response.json(await estimateSurplus(outlet.id, date));
});

export const OPTIONS = preflight;
