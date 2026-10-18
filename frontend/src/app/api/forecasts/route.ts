import { ApiError, handle, readJson, requireOutletAccess, requireString } from "@/lib/api";
import { addDays, isIsoDate, tomorrow } from "@/lib/dates";
import { ml } from "@/lib/ml";
import { prisma } from "@/lib/prisma";

/** GET /api/forecasts?outletId=&start=&end=  — stored forecasts per dish per day. */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const outletId = requireString(url.searchParams.get("outletId"), "outletId");
  await requireOutletAccess(outletId);
  const start = url.searchParams.get("start") ?? tomorrow();
  const end = url.searchParams.get("end") ?? addDays(start, 6);
  if (!isIsoDate(start) || !isIsoDate(end)) throw new ApiError("start/end must be YYYY-MM-DD.");

  const rows = await prisma.forecast.findMany({
    where: { outletId, date: { gte: start, lte: end } },
    include: { dish: { select: { name: true, category: true, price: true, isActive: true } } },
    orderBy: [{ date: "asc" }, { dish: { name: "asc" } }],
  });
  return Response.json(
    rows.map((r) => ({
      id: r.id,
      dishId: r.dishId,
      dishName: r.dish.name,
      category: r.dish.category,
      price: r.dish.price,
      date: r.date,
      low: r.low,
      likely: r.likely,
      high: r.high,
      modelVersion: r.modelVersion,
      explanation: r.explanation,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

/** POST /api/forecasts { outletId, startDate?, days? } — ask the ML service to (re)generate. */
export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const outletId = requireString(body.outletId, "outletId");
  await requireOutletAccess(outletId);
  const startDate = typeof body.startDate === "string" ? body.startDate : tomorrow();
  const days = Math.min(14, Math.max(1, Number(body.days ?? 7)));
  if (!isIsoDate(startDate)) throw new ApiError("startDate must be YYYY-MM-DD.");

  const rows = await ml.generateForecasts({ outletId, startDate, days });
  return Response.json({ generated: rows.length, startDate, days, modelVersion: rows[0]?.modelVersion ?? null });
});
