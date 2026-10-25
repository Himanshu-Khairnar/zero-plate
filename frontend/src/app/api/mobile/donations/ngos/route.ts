import { listNgos } from "@/lib/donations";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

/** GET /api/mobile/donations/ngos?outletId= : the shared NGO directory (by city, then name). */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const rows = await listNgos();
  return Response.json({
    items: rows.map((n) => ({ id: n.id, name: n.name, city: n.city, contact: n.contact, acceptsCooked: n.acceptsCooked })),
  });
});

export const OPTIONS = preflight;
