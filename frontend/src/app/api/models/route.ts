import { handle, readJson, requireOutletAccess, requireRole, requireString } from "@/lib/api";
import { ml } from "@/lib/ml";
import { prisma } from "@/lib/prisma";

/** GET /api/models?outletId= — training history and the active model. */
export const GET = handle(async (req: Request) => {
  const outletId = requireString(new URL(req.url).searchParams.get("outletId"), "outletId");
  await requireOutletAccess(outletId);
  const runs = await prisma.modelRun.findMany({ where: { outletId }, orderBy: { trainedAt: "desc" } });
  const view = runs.map((r) => {
    let metrics: unknown = null;
    try {
      metrics = JSON.parse(r.metricsJson);
    } catch {
      /* keep null */
    }
    return {
      id: r.id,
      version: r.version,
      modelName: r.modelName,
      trainedAt: r.trainedAt.toISOString(),
      trainRows: r.trainRows,
      mae: r.mae,
      mape: r.mape,
      coverage: r.coverage,
      isActive: r.isActive,
      promotedAt: r.promotedAt?.toISOString() ?? null,
      metrics,
    };
  });
  return Response.json({ outletId, active: view.find((r) => r.isActive) ?? null, runs: view });
});

/** POST /api/models { outletId, promote? } — retrain now (what the weekly job does). */
export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const outletId = requireString(body.outletId, "outletId");
  const viewer = await requireOutletAccess(outletId);
  requireRole(viewer, "OWNER", "PLATFORM_ADMIN");
  const promote = body.promote !== false;
  return Response.json(await ml.train({ outletId, promote }));
});
