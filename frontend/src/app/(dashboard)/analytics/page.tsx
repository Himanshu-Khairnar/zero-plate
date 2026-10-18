import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Leaf, Lightbulb } from "lucide-react";

import { AccuracyChart, MenuEngineeringChart, RevenueChart, WasteByReasonChart, type MenuPoint } from "@/components/analytics/charts";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OutletPicker } from "@/components/url-controls";
import { outletOverview } from "@/lib/analytics";
import { inr, num, pct } from "@/lib/format";
import { resolveOutlet } from "@/lib/outlets";

export const metadata = { title: "Analytics" };

type Search = Promise<{ outlet?: string }>;
type MenuEngineering = {
  medians: { popularity: number; margin: number } | null;
  counts?: Record<string, number>;
  dishes: { dishId: string; name: string; category: string; price: number; costPerPlate: number; popularity: number; margin: number; group: string; suggestion: string }[];
};

const ML = process.env.ML_SERVICE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GROUP_LABEL: Record<string, string> = { star: "Star", plowhorse: "Plowhorse", puzzle: "Puzzle", dog: "Dog" };

async function menuEngineering(outletId: string): Promise<MenuEngineering | null> {
  try {
    const res = await fetch(`${ML}/api/menu-engineering/${outletId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MenuEngineering;
  } catch {
    return null;
  }
}

export default function AnalyticsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Analytics searchParams={searchParams} />
    </Suspense>
  );
}

async function Analytics({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const [o, me] = await Promise.all([outletOverview(outlet.id), menuEngineering(outlet.id)]);

  return (
    <>
      <PageHeader title="Analytics" description="Sales, forecast accuracy, waste, money saved and CO₂ avoided for the last 30 days.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue · 30 days" value={inr(o.revenue30)} hint={o.revenueChange7 != null ? `${o.revenueChange7 > 0 ? "+" : ""}${o.revenueChange7}% last 7d vs previous 7d` : `${num(o.plates30)} plates`} tone={o.revenueChange7 != null && o.revenueChange7 >= 0 ? "good" : undefined} />
        <Stat label="Waste" value={pct(o.wastePct, 1)} hint={`${num(o.waste.plates)} plates · ${inr(o.waste.cost)} at cost`} tone={o.wastePct > 5 ? "bad" : "good"} />
        <Stat label="Forecast MAPE" value={o.accuracy.mape != null ? pct(o.accuracy.mape, 1) : "—"} hint={o.accuracy.n ? `${pct((o.accuracy.coverage ?? 0) * 100, 0)} of actuals inside the range · ${o.accuracy.n} dish-days` : "no past forecasts to score yet"} tone={o.accuracy.mape != null && o.accuracy.mape < 20 ? "good" : undefined} />
        <Stat label="Money saved · est." value={inr(o.savings.moneySaved)} hint={o.savings.baselineShare != null && o.savings.currentShare != null ? `waste ${o.savings.baselineShare}% → ${o.savings.currentShare}% of revenue` : o.savings.note} tone={o.savings.moneySaved > 0 ? "good" : undefined} />
        <Stat label="CO₂ avoided · est." value={`${num(o.co2AvoidedKg, 1)} kg`} hint="2.5 kg CO₂e per kg food, 0.35 kg per plate" icon={<Leaf />} />
        <Stat label="Meals donated" value={num(o.donated.month)} hint={`${num(o.donated.all)} all time`} />
        <Stat label="Plan for tomorrow" value={<Badge variant={o.planPending ? "secondary" : "default"}>{o.planStatus}</Badge>} hint={o.planPending ? "needs review" : "approved"} />
        <Stat label="Unread alerts" value={o.unreadAlerts} tone={o.unreadAlerts ? "bad" : "good"} hint={<Link href="/alerts" className="underline underline-offset-4">open alerts</Link>} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sales · last 30 days</CardTitle>
            <CardDescription>Revenue and plates per day from POS imports and kitchen-mode logs.</CardDescription>
          </CardHeader>
          <CardContent>{o.series.some((p) => p.plates > 0) ? <RevenueChart data={o.series} /> : <EmptyState title="No sales in the last 30 days" />}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Waste by reason</CardTitle>
            <CardDescription>Cost of waste in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>{o.waste.byReason.length ? <WasteByReasonChart data={o.waste.byReason} /> : <EmptyState title="No waste logged yet" />}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Forecast vs actual</CardTitle>
            <CardDescription>Daily totals over the menu for days that have both a forecast and logged sales.</CardDescription>
          </CardHeader>
          <CardContent>{o.accuracy.series.length ? <AccuracyChart data={o.accuracy.series} /> : <EmptyState title="Nothing to compare yet">Forecasts are scored once the forecast day has passed and sales are logged.</EmptyState>}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Why tomorrow looks like this</CardTitle>
            <CardDescription>Plain-language reasons behind the biggest forecasts.</CardDescription>
          </CardHeader>
          <CardContent>
            {o.explanations.length ? (
              <ul className="flex flex-col gap-3">
                {o.explanations.map((e) => (
                  <li key={e.dish} className="flex gap-3 text-sm">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div><span className="font-medium">{e.dish}</span> · {e.likely} plates<p className="text-xs text-muted-foreground">{e.explanation}</p></div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No forecast for tomorrow yet" />
            )}
            <Button variant="link" size="sm" className="mt-2 px-0" nativeButton={false} render={<Link href={`/forecasts?outlet=${outlet.id}`} />}>
              All forecasts <ArrowRight data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Menu engineering</CardTitle>
          <CardDescription>Dishes grouped by popularity (plates per day, last 28 days) and margin per plate. K-means with 4 groups, named by quadrant.</CardDescription>
        </CardHeader>
        <CardContent>
          {me && me.dishes.length ? (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <MenuEngineeringChart data={me.dishes.map((d): MenuPoint => ({ name: d.name, group: d.group, popularity: d.popularity, margin: d.margin, price: d.price }))} medians={me.medians} />
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {Object.entries(GROUP_LABEL).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: `var(--chart-${{ star: 1, plowhorse: 2, puzzle: 3, dog: 4 }[k]})` }} />{v} {me.counts?.[k] ? `(${me.counts[k]})` : ""}</span>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dish</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead className="text-right">Plates / day</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead>Suggestion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {me.dishes.map((d) => (
                      <TableRow key={d.dishId}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell><Badge variant={d.group === "star" ? "default" : d.group === "dog" ? "destructive" : "secondary"}>{GROUP_LABEL[d.group] ?? d.group}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{d.popularity.toFixed(1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(d.margin)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.suggestion}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <EmptyState title="Menu engineering unavailable">The ML service is not reachable, or there are no dishes with sales yet.</EmptyState>
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-80" />
    </div>
  );
}
