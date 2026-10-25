import { ApiError } from "@/lib/api";
import { mobileRoute, preflight, readOptionalJson, requireMobileRole, requireMobileSession, resolveMobileOutlet } from "@/lib/mobile-auth";
import { approvePlan, getPlanById } from "@/lib/prep-plans";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/mobile/prep-plan/:id/approve, optional body `{ notes? }` (OWNER/MANAGER only). */
export const POST = mobileRoute(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { viewer } = await requireMobileSession(req);
  requireMobileRole(viewer, "OWNER", "MANAGER");
  const body = await readOptionalJson(req);
  if (body.notes != null && typeof body.notes !== "string") throw new ApiError("notes must be a string.");
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null;
  const plan = await getPlanById(id);
  if (!plan) throw new ApiError("Plan not found.", 404);
  await resolveMobileOutlet(viewer, plan.outletId);
  await approvePlan(id, viewer.name, notes);
  return Response.json({ ok: true });
});

export const OPTIONS = preflight;
