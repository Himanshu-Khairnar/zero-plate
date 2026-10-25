import { ALERT_TITLE } from "@/lib/alerts";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/mobile/alerts?outletId= — latest 100 alerts, newest first. */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const rows = await prisma.alert.findMany({ where: { outletId: outlet.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return Response.json({
    items: rows.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: ALERT_TITLE[a.type] ?? "Alert",
      message: a.message,
      createdAt: a.createdAt.toISOString(),
      read: a.isRead,
    })),
  });
});

export const OPTIONS = preflight;
