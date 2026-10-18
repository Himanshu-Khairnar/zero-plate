import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/action-button";
import { ForecastChart, type ChartPoint } from "@/components/forecast-chart";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { DatePicker, DishPicker, OutletPicker } from "@/components/url-controls";
import { addDays, formatDate, isIsoDate, today, tomorrow } from "@/lib/dates";
import { num } from "@/lib/format";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Forecasts" };

type Search = Promise<{ outlet?: string; date?: string; dish?: string }>;

export default function ForecastsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Forecasts searchParams={searchParams} />
    </Suspense>
  );
}

async function Forecasts({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet">Seed the demo data first.</EmptyState>;

  const date = isIsoDate(sp.date) ? sp.date : tomorrow();
  const dishes = await prisma.dish.findMany({ where: { outletId: outlet.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true } });
  const dish = dishes.find((d) => d.id === sp.dish) ?? dishes[0];
  const historyStart = addDays(today(), -28);
  const horizonEnd = addDays(today(), 13);

  const [dayForecasts, dishForecasts, history] = await Promise.all([
    prisma.forecast.findMany({ where: { outletId: outlet.id, date }, include: { dish: { select: { name: true, category: true } } }, orderBy: { dish: { name: "asc" } } }),
    dish ? prisma.forecast.findMany({ where: { dishId: dish.id, date: { gte: today(), lte: horizonEnd } }, orderBy: { date: "asc" } }) : [],
    dish ? prisma.salesRecord.groupBy({ by: ["date"], where: { dishId: dish.id, date: { gte: historyStart } }, _sum: { qtySold: true }, orderBy: { date: "asc" } }) : [],
  ]);

  const points = new Map<string, ChartPoint>();
  for (const h of history) points.set(h.date, { date: h.date, actual: h._sum.qtySold ?? 0 });
  for (const f of dishForecasts) points.set(f.date, { ...(points.get(f.date) ?? { date: f.date }), low: f.low, likely: f.likely, high: f.high });
  const chart = [...points.values()].sort((a, b) => a.date.localeCompare(b.date));

  const totalLikely = dayForecasts.reduce((s, f) => s + f.likely, 0);
  const version = dayForecasts[0]?.modelVersion ?? dishForecasts[0]?.modelVersion ?? null;
  const generatedAt = dayForecasts[0]?.createdAt ?? null;

  return (
    <>
      <PageHeader title="Forecasts" description="Plates per dish per day, with a range and the reason behind the number.">
        <OutletPicker outlets={outlets} value={outlet.id} />
        <DatePicker value={date} min={today()} max={addDays(today(), 13)} />
        <ActionButton url="/api/forecasts" body={{ outletId: outlet.id, startDate: date, days: 7 }} variant="outline" successText="Forecasts refreshed">
          Regenerate 7 days from {formatDate(date, { day: "numeric", month: "short" })}
        </ActionButton>
      </PageHeader>

      {dish ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{dish.name}</CardTitle>
              <CardDescription>Last 4 weeks sold, next days forecast. The shaded band is the 10th–90th percentile range.</CardDescription>
            </div>
            <DishPicker dishes={dishes} value={dish.id} />
          </CardHeader>
          <CardContent>
            {chart.length ? <ForecastChart data={chart} dishName={dish.name} /> : <EmptyState title="No sales or forecasts yet for this dish" />}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={formatDate(date, { weekday: "long", day: "numeric", month: "short" })} value={dayForecasts.length ? `${num(totalLikely)} plates` : "—"} hint="expected demand across the menu" />
        <Stat label="Model" value={version ?? "—"} hint={generatedAt ? `generated ${generatedAt.toLocaleString("en-IN")}` : "no forecast stored for this day"} />
        <Stat label="Dishes forecast" value={dayForecasts.length} hint={`${dishes.length} active on the menu`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All dishes · {formatDate(date)}</CardTitle>
          <CardDescription>Low / likely / high plates and the plain-language explanation shown to owners.</CardDescription>
        </CardHeader>
        <CardContent>
          {dayForecasts.length === 0 ? (
            <EmptyState title="No forecast stored for this day yet">
              The nightly job writes the next 7 days. Use &ldquo;Regenerate&rdquo; above to produce it now (the ML service must be running).
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dish</TableHead>
                  <TableHead className="text-right">Low</TableHead>
                  <TableHead className="text-right">Likely</TableHead>
                  <TableHead className="text-right">High</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayForecasts.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">
                      {f.dish.name}
                      <Badge variant="outline" className="ml-2 text-[10px]">{f.dish.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Math.round(f.low)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{Math.round(f.likely)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Math.round(f.high)}</TableCell>
                    <TableCell className="max-w-md text-xs text-muted-foreground">{f.explanation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16" />
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}
