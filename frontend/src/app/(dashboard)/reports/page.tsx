import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { DownloadButtons, PeriodPicker } from "@/components/reports/report-controls";
import { OutletPicker } from "@/components/url-controls";
import { addDays, formatDate, isIsoDate, today } from "@/lib/dates";
import { inr, num, pct } from "@/lib/format";
import { resolveOutlet } from "@/lib/outlets";
import { buildReport, lastMonth } from "@/lib/reports";

export const metadata = { title: "Reports" };

type Search = Promise<{ outlet?: string; start?: string; end?: string }>;

export default function ReportsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const fallback = lastMonth();
  const start = isIsoDate(sp.start) ? sp.start : fallback.start;
  const end = isIsoDate(sp.end) && sp.end >= start ? sp.end : fallback.end;
  const preset = start === addDays(today(), -7) && end === addDays(today(), -1) ? "week" : start === fallback.start && end === fallback.end ? "month" : "custom";
  const r = await buildReport(outlet.id, { start, end });

  return (
    <>
      <PageHeader title="Reports" description="Weekly and monthly summaries of sales, waste, forecast accuracy and donations. Export to Excel, PDF or CSV.">
        <OutletPicker outlets={outlets} value={outlet.id} />
        <DownloadButtons outletId={outlet.id} start={start} end={end} />
      </PageHeader>

      <Card size="sm">
        <CardContent>
          <PeriodPicker start={start} end={end} preset={preset} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={inr(r.totals.revenue)} hint={`${num(r.totals.plates)} plates over ${r.totals.days} days`} />
        <Stat label="Waste" value={inr(r.totals.wasteCost)} hint={r.totals.wasteSharePct != null ? `${num(r.totals.wastePlates, 1)} plates · ${pct(r.totals.wasteSharePct, 1)} of plates` : "no waste logged"} tone={r.totals.wasteSharePct != null && r.totals.wasteSharePct > 5 ? "bad" : undefined} />
        <Stat label="Forecast accuracy" value={r.totals.forecastMape != null ? `MAPE ${pct(r.totals.forecastMape, 1)}` : "—"} hint={r.totals.forecastCoverage != null ? `${pct(r.totals.forecastCoverage, 0)} of actuals inside the range` : "no forecasts for past days yet"} tone={r.totals.forecastMape != null && r.totals.forecastMape < 20 ? "good" : undefined} />
        <Stat label="Meals donated" value={num(r.totals.mealsDonated)} hint="collected donations in the period" tone={r.totals.mealsDonated > 0 ? "good" : "muted"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top dishes</CardTitle>
            <CardDescription>By revenue, {formatDate(start)} – {formatDate(end)}.</CardDescription>
          </CardHeader>
          <CardContent>
            {r.dishes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dish</TableHead>
                    <TableHead className="text-right">Plates</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Waste</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.dishes.slice(0, 8).map((d) => (
                    <TableRow key={d.dishId}>
                      <TableCell className="font-medium">
                        {d.name} <Badge variant="outline" className="ml-1 text-[10px]">{d.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(d.plates)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(d.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{d.wastePlates ? inr(d.wasteCost) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Waste by reason</CardTitle>
            <CardDescription>Where the money goes, plus the worst dishes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {r.waste.length === 0 ? (
              <p className="text-sm text-muted-foreground">No waste logged in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.waste.map((w) => (
                    <TableRow key={w.reason}>
                      <TableCell className="font-medium capitalize">{w.reason.replace("_", " ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(w.qty, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(w.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{w.entries}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {r.topWasted.length ? (
              <div className="flex flex-wrap gap-1.5">
                {r.topWasted.map((d) => (
                  <Badge key={d.dishId} variant="secondary">
                    {d.name} · {inr(d.wasteCost)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Day by day</CardTitle>
          <CardDescription>Plates sold, revenue, waste and prep-plan status per day.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Plates</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Waste plates</TableHead>
                <TableHead className="text-right">Waste cost</TableHead>
                <TableHead className="text-right">Forecast err.</TableHead>
                <TableHead>Prep plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.days.map((d) => {
                const acc = r.accuracy.find((a) => a.date === d.date);
                const plan = r.adherence.find((a) => a.date === d.date);
                return (
                  <TableRow key={d.date}>
                    <TableCell className="font-medium">{formatDate(d.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(d.plates)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(d.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.wastePlates ? num(d.wastePlates, 1) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.wasteCost ? inr(d.wasteCost) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{acc && acc.actual > 0 ? pct((acc.absError / acc.actual) * 100, 0) : "—"}</TableCell>
                    <TableCell>{plan ? <Badge variant={plan.status === "APPROVED" ? "default" : "outline"}>{plan.status.toLowerCase()} · {plan.planned} planned</Badge> : <span className="text-xs text-muted-foreground">no plan</span>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-80" />
    </div>
  );
}
