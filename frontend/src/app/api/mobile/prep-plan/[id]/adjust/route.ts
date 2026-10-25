import { z } from "zod";

import { ApiError, readJson } from "@/lib/api";
import { mobileRoute, preflight, requireMobileRole, requireMobileSession, resolveMobileOutlet } from "@/lib/mobile-auth";
import { adjustPlan, getPlanById } from "@/lib/prep-plans";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  changes: z
    .array(
      z.object({
        dishId: z.string().min(1),
        plannedQty: z.number().finite().min(0),
        reason: z.string().max(300).nullish(),
      }),
    )
    .min(1),
});

/**
 * POST /api/mobile/prep-plan/:id/adjust { changes: [{ dishId, plannedQty, reason? }] } (OWNER/MANAGER)
 * Every change is recorded as a PrepPlanAdjustment by the caller, as on the web. LOCKED gives 409.
 */
export const POST = mobileRoute(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { viewer } = await requireMobileSession(req);
  requireMobileRole(viewer, "OWNER", "MANAGER");
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError("changes must be a non-empty list of { dishId, plannedQty (0 or more), reason? }.");
  const plan = await getPlanById(id);
  if (!plan) throw new ApiError("Plan not found.", 404);
  await resolveMobileOutlet(viewer, plan.outletId);
  const changes = parsed.data.changes.map((c) => ({ dishId: c.dishId, plannedQty: c.plannedQty, reason: c.reason ?? null }));
  return Response.json({ plan: await adjustPlan(id, viewer.name, changes) });
});

export const OPTIONS = preflight;
