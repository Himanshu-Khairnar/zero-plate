import { tomorrow } from "@/lib/dates";
import { mobileDate, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { getPlanById } from "@/lib/prep-plans";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/mobile/prep-plan/full?outletId=&date= (date defaults to tomorrow)
 * `{ plan: PlanView | null }`, the same view the web prep-plan page uses. Never drafts.
 */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const date = mobileDate(url.searchParams.get("date"), tomorrow());
  const row = await prisma.prepPlan.findUnique({ where: { outletId_date: { outletId: outlet.id, date } }, select: { id: true } });
  return Response.json({ plan: row ? await getPlanById(row.id) : null });
});

export const OPTIONS = preflight;
