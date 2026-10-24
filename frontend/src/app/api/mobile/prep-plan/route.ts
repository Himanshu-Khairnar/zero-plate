import { ApiError } from "@/lib/api";
import { isIsoDate, tomorrow } from "@/lib/dates";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { getPlanById } from "@/lib/prep-plans";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/mobile/prep-plan?outletId=&date=YYYY-MM-DD (date defaults to tomorrow)
 * Read-only: returns `{ plan: null }` when no plan exists yet; drafting one
 * (which may call the ML service) stays on the web prep-plan page.
 */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const date = url.searchParams.get("date") || tomorrow();
  if (!isIsoDate(date)) throw new ApiError("date must be YYYY-MM-DD.");

  const row = await prisma.prepPlan.findUnique({ where: { outletId_date: { outletId: outlet.id, date } }, select: { id: true } });
  const plan = row ? await getPlanById(row.id) : null;
  if (!plan) return Response.json({ plan: null });

  return Response.json({
    plan: {
      id: plan.id,
      date: plan.date,
      status: plan.status,
      items: plan.items.map((i) => ({
        id: i.id,
        dishId: i.dishId,
        dishName: i.dishName,
        forecastQty: Math.round(i.forecastLikely),
        plannedQty: i.plannedQty,
        unit: "plates",
      })),
    },
  });
});

export const OPTIONS = preflight;
