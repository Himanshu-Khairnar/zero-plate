import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { stockRows, suggestPurchaseOrders } from "@/lib/stock";

/** GET /api/mobile/inventory?outletId= : read-only stock view plus suggested orders (nothing is saved). */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const [rows, suggestedOrders] = await Promise.all([stockRows(outlet.id), suggestPurchaseOrders(outlet.id)]);
  return Response.json({ rows, suggestedOrders });
});

export const OPTIONS = preflight;
