import { forecastAccuracy, mealsDonated, salesSeries } from "@/lib/analytics";
import { addDays, today, tomorrow } from "@/lib/dates";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { round } from "@/lib/prep";
import { prisma } from "@/lib/prisma";
import { wasteValuer } from "@/lib/waste-log";

const WASTE_WINDOW_DAYS = 30;
const TREND_DAYS = 14;

/**
 * GET /api/mobile/dashboard?outletId=
 * - forecastCovers: today's forecast (likely, summed over dishes)
 * - wasteKg / wasteValue: last 30 days including today
 * - revenue: last 30 days up to yesterday (analytics convention)
 * - accuracyPct: 100 − MAPE over the last 28 days, null without data
 * - mealsDonated: collected donations this month
 * - prepStatus: tomorrow's prep plan (the one awaiting approval)
 */
export const GET = mobileRoute(async (req: Request) => {
  const url = new URL(req.url);
  const { outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"));
  const outletId = outlet.id;
  const date = today();
  const windowStart = addDays(date, -(WASTE_WINDOW_DAYS - 1));
  const trendStart = addDays(date, -(TREND_DAYS - 1));

  const [forecasts, wasteRows, value, sales, accuracy, donated, plan, alertsOpen] = await Promise.all([
    prisma.forecast.findMany({ where: { outletId, date, dish: { isActive: true } }, select: { likely: true } }),
    prisma.wasteLog.findMany({ where: { outletId, date: { gte: windowStart, lte: date } }, select: { date: true, dishId: true, ingredientId: true, qty: true } }),
    wasteValuer(outletId),
    salesSeries(outletId, 30),
    forecastAccuracy(outletId, 28),
    mealsDonated(outletId),
    prisma.prepPlan.findUnique({ where: { outletId_date: { outletId, date: tomorrow() } }, select: { status: true } }),
    prisma.alert.count({ where: { outletId, isRead: false } }),
  ]);

  let wasteKg = 0;
  let wasteValue = 0;
  const trend = new Map<string, number>();
  for (let i = 0; i < TREND_DAYS; i++) trend.set(addDays(trendStart, i), 0);
  for (const w of wasteRows) {
    const v = value(w);
    wasteKg += v.kg;
    wasteValue += v.value;
    if (trend.has(w.date)) trend.set(w.date, (trend.get(w.date) ?? 0) + v.kg);
  }

  return Response.json({
    date,
    kpis: {
      forecastCovers: Math.round(forecasts.reduce((s, f) => s + f.likely, 0)),
      wasteKg: round(wasteKg, 1),
      wasteValue: round(wasteValue, 0),
      revenue: round(sales.reduce((s, p) => s + p.revenue, 0), 0),
      accuracyPct: accuracy.mape == null ? null : round(Math.max(0, 100 - accuracy.mape), 1),
      mealsDonated: donated.month,
    },
    alertsOpen,
    prepStatus: !plan ? "NONE" : plan.status === "DRAFT" ? "DRAFT" : "APPROVED",
    wasteTrend: [...trend.entries()].map(([d, kg]) => ({ date: d, wasteKg: round(kg, 1) })),
  });
});

export const OPTIONS = preflight;
