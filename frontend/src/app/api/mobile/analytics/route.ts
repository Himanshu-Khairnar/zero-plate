import { forecastAccuracy, nextDayExplanations, salesSeries, savingsEstimate, wasteSummary } from "@/lib/analytics";
import { clampInt, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/analytics?outletId=&days=30 (days clamped to 7-90)
 * Same numbers as the web analytics page (`src/lib/analytics.ts`), up to yesterday.
 */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const days = clampInt(url.searchParams.get("days"), 7, 90, 30);
  const [sales, accuracy, waste, savings, explanations] = await Promise.all([
    salesSeries(outlet.id, days),
    forecastAccuracy(outlet.id, days),
    wasteSummary(outlet.id, days),
    savingsEstimate(outlet.id),
    nextDayExplanations(outlet.id),
  ]);
  return Response.json({
    sales,
    accuracy: accuracy.series,
    waste: { byReason: waste.byReason, totalPlates: waste.plates, totalCost: waste.cost },
    savings,
    explanations,
  });
});

export const OPTIONS = preflight;
