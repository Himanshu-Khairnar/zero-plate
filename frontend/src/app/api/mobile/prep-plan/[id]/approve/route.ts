import { ApiError } from "@/lib/api";
import { mobileRoute, preflight, requireMobileRole, requireMobileSession, resolveMobileOutlet } from "@/lib/mobile-auth";
import { approvePlan, getPlanById } from "@/lib/prep-plans";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/mobile/prep-plan/:id/approve — OWNER/MANAGER only. */
export const POST = mobileRoute(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { viewer } = await requireMobileSession(req);
  requireMobileRole(viewer, "OWNER", "MANAGER");
  const plan = await getPlanById(id);
  if (!plan) throw new ApiError("Plan not found.", 404);
  await resolveMobileOutlet(viewer, plan.outletId);
  await approvePlan(id, viewer.name);
  return Response.json({ ok: true });
});

export const OPTIONS = preflight;
