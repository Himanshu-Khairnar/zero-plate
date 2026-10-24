import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { WASTE_REASONS } from "@/lib/waste";

/** GET /api/mobile/waste/options?outletId= — what the waste form can pick from (same rows the web form accepts). */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const [dishes, ingredients] = await Promise.all([
    prisma.dish.findMany({ where: { outletId: outlet.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ingredient.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } }),
  ]);
  return Response.json({ dishes, ingredients, reasons: [...WASTE_REASONS] });
});

export const OPTIONS = preflight;
