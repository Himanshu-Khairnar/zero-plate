import { ApiError, handle, readJson, requireOutletAccess } from "@/lib/api";
import { adjustPlan, getPlanById } from "@/lib/prep-plans";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const plan = await getPlanById(id);
  if (!plan) return Response.json({ error: "Plan not found." }, { status: 404 });
  await requireOutletAccess(plan.outletId);
  return Response.json(plan);
});

/**
 * PATCH /api/prep-plans/:id
 * { items: [{ dishId, plannedQty, reason? }], adjustedBy? }
 * Every change is written to PrepPlanAdjustment.
 */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const existing = await getPlanById(id);
  if (!existing) throw new ApiError("Plan not found.", 404);
  const viewer = await requireOutletAccess(existing.outletId);
  const body = await readJson<{ items?: unknown; adjustedBy?: string }>(req);
  if (!Array.isArray(body.items) || body.items.length === 0) throw new ApiError("items[] is required.");
  const changes = body.items.map((raw) => {
    const it = raw as { dishId?: unknown; plannedQty?: unknown; reason?: unknown };
    if (typeof it.dishId !== "string") throw new ApiError("items[].dishId is required.");
    const qty = Number(it.plannedQty);
    if (!Number.isFinite(qty) || qty < 0) throw new ApiError("items[].plannedQty must be a non-negative number.");
    return { dishId: it.dishId, plannedQty: qty, reason: typeof it.reason === "string" ? it.reason : null };
  });
  return Response.json(await adjustPlan(id, viewer.name, changes));
});
