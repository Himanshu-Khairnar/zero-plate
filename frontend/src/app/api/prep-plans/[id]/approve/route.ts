import { ApiError, handle, readJson, requireOutletAccess, requireRole } from "@/lib/api";
import { approvePlan, getPlanById } from "@/lib/prep-plans";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/prep-plans/:id/approve { approvedBy?, notes? } */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const existing = await getPlanById(id);
  if (!existing) throw new ApiError("Plan not found.", 404);
  const viewer = await requireOutletAccess(existing.outletId);
  requireRole(viewer, "OWNER", "MANAGER");
  const body = await readJson<{ approvedBy?: string; notes?: string }>(req).catch(() => ({}) as { approvedBy?: string; notes?: string });
  return Response.json(await approvePlan(id, viewer.name, body.notes ?? null));
});
