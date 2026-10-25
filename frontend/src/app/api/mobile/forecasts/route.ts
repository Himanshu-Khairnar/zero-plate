import { addDays, today } from "@/lib/dates";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/mobile/forecasts?outletId=&days=7 — stored forecasts from today for `days` days (1–14). */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const days = Math.min(14, Math.max(1, Math.round(Number(url.searchParams.get("days") ?? 7)) || 7));
  const start = today();
  const end = addDays(start, days - 1);

  const rows = await prisma.forecast.findMany({
    where: { outletId: outlet.id, date: { gte: start, lte: end }, dish: { isActive: true } },
    include: { dish: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { dish: { name: "asc" } }],
  });

  const byDate = new Map<string, { dishId: string; dishName: string; low: number; likely: number; high: number }[]>();
  for (let i = 0; i < days; i++) byDate.set(addDays(start, i), []);
  for (const r of rows) {
    byDate.get(r.date)?.push({ dishId: r.dishId, dishName: r.dish.name, low: Math.round(r.low), likely: Math.round(r.likely), high: Math.round(r.high) });
  }
  return Response.json({ days: [...byDate.entries()].map(([date, items]) => ({ date, items })) });
});

export const OPTIONS = preflight;
