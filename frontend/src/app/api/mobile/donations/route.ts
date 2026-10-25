import { ApiError, readJson } from "@/lib/api";
import { mealsDonated } from "@/lib/analytics";
import { donationSchema, recordDonation } from "@/lib/donations";
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

/**
 * POST /api/mobile/donations { outletId, ngoId?, date, meals, dishNames?, note? }
 * OWNER/MANAGER/KITCHEN_STAFF. Same validation as the web form; unknown NGO gives 404.
 */
export const POST = mobileRoute(async (req: Request) => {
  const raw = await readJson(req);
  // Treat JSON nulls as "not given" so clients can send optional fields as null.
  const body = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null));
  const { viewer, outlet } = await requireMobileOutlet(req, body.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
  const parsed = donationSchema.safeParse({ ...body, outletId: outlet.id });
  if (!parsed.success) throw new ApiError("Please check the donation values (date YYYY-MM-DD, meals a positive whole number).");
  const { id } = await recordDonation(viewer, parsed.data);
  return Response.json({ ok: true, id });
});

export const OPTIONS = preflight;
