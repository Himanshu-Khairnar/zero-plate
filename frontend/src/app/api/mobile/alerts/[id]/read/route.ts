import { ApiError } from "@/lib/api";
import { setAlertRead } from "@/lib/alerts";
import { mobileRoute, preflight, requireMobileSession, resolveMobileOutlet } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/mobile/alerts/:id/read */
export const POST = mobileRoute(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { viewer } = await requireMobileSession(req);
  const alert = await prisma.alert.findUnique({ where: { id }, select: { outletId: true } });
  if (!alert) throw new ApiError("Alert not found.", 404);
  await resolveMobileOutlet(viewer, alert.outletId);
  await setAlertRead(alert.outletId, id);
  return Response.json({ ok: true });
});

export const OPTIONS = preflight;
