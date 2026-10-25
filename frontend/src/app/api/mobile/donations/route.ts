import { mealsDonated } from "@/lib/analytics";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/mobile/donations?outletId= — mealsDonated counts all collected donations; items are the latest 50. */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const [donated, rows] = await Promise.all([
    mealsDonated(outlet.id),
    prisma.donation.findMany({
      where: { outletId: outlet.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: { ngo: { select: { name: true } } },
    }),
  ]);
  return Response.json({
    mealsDonated: donated.all,
    items: rows.map((d) => ({ id: d.id, date: d.date, ngoName: d.ngo?.name ?? null, meals: d.meals, status: d.status })),
  });
});

export const OPTIONS = preflight;
