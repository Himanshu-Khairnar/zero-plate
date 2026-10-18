import { Suspense } from "react";

import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OutletPicker } from "@/components/url-controls";
import { wasteSummary } from "@/lib/analytics";
import { inr, num } from "@/lib/format";
import { resolveOutlet } from "@/lib/outlets";

export const metadata = { title: "Waste heatmap" };

type Search = Promise<{ outlet?: string; days?: string }>;

export default function HeatmapPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Heatmap searchParams={searchParams} />
    </Suspense>
  );
}

async function Heatmap({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const days = sp.days === "90" ? 90 : 30;
  const waste = await wasteSummary(outlet.id, days);

  const dishes = [...new Map(waste.heatmap.map((h) => [h.dishId, h.dishName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cell = new Map(waste.heatmap.map((h) => [`${h.dishId}|${h.weekday}`, h]));
  const max = Math.max(1, ...waste.heatmap.map((h) => h.plates));
  const worst = [...waste.heatmap].sort((a, b) => b.plates - a.plates).slice(0, 3);
  const byDish = dishes.map(([id, name]) => ({ id, name, plates: waste.heatmap.filter((h) => h.dishId === id).reduce((s, h) => s + h.plates, 0) }));
  const byDay = waste.weekdays.map((w, i) => ({ w, plates: waste.heatmap.filter((h) => h.weekday === i).reduce((s, h) => s + h.plates, 0) }));

  return (
    <>
      <PageHeader title="Waste heatmap" description={`Plates wasted by dish and day of the week, last ${days} days. Darker means more waste.`}>
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Plates wasted" value={num(waste.plates)} hint={`${inr(waste.cost)} at cost`} />
        <Stat label="Worst dish" value={byDish.length ? byDish.sort((a, b) => b.plates - a.plates)[0].name : "—"} hint={byDish.length ? `${num(byDish[0].plates)} plates` : ""} />
        <Stat label="Worst day" value={byDay.length ? byDay.reduce((a, b) => (b.plates > a.plates ? b : a)).w : "—"} hint="day of the week" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dish × weekday</CardTitle>
          <CardDescription>Hover a cell for the cost. Based on logged waste (module H).</CardDescription>
        </CardHeader>
        <CardContent>
          {dishes.length === 0 ? (
            <EmptyState title="No waste logged yet">Log waste from the Waste Log page or kitchen mode and the heatmap fills in.</EmptyState>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dish</TableHead>
                    {waste.weekdays.map((w) => <TableHead key={w} className="text-center">{w}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dishes.map(([id, name]) => (
                    <TableRow key={id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      {waste.weekdays.map((_, i) => {
                        const h = cell.get(`${id}|${i}`);
                        const t = h ? h.plates / max : 0;
                        return (
                          <TableCell key={i} className="p-1 text-center">
                            <Tooltip>
                              <TooltipTrigger render={<div className="rounded-md px-1 py-2 text-xs font-medium tabular-nums" style={{ background: t ? `color-mix(in oklch, var(--chart-4) ${Math.round(12 + t * 78)}%, transparent)` : "var(--muted)", color: t > 0.6 ? "var(--primary-foreground)" : "inherit" }} />}>
                                {h ? num(h.plates) : "·"}
                              </TooltipTrigger>
                              <TooltipContent>{h ? `${name} · ${waste.weekdays[i]}: ${num(h.plates)} plates, ${inr(h.cost)}` : "No waste logged"}</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular-nums text-muted-foreground">{num(byDish.find((d) => d.id === id)?.plates ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">All dishes</TableCell>
                    {byDay.map((d) => <TableCell key={d.w} className="text-center tabular-nums font-medium">{num(d.plates)}</TableCell>)}
                    <TableCell className="text-right tabular-nums font-semibold">{num(waste.plates)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Less</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => <span key={t} className="h-3 w-6 rounded-sm" style={{ background: `color-mix(in oklch, var(--chart-4) ${Math.round(12 + t * 78)}%, transparent)` }} />)}
                <span>More</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {worst.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Where to look first</CardTitle>
            <CardDescription>The three dish and day combinations with the most waste.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-3">
              {worst.map((w, i) => (
                <li key={`${w.dishId}-${w.weekday}`} className="rounded-lg border p-3">
                  <Badge variant="outline">#{i + 1}</Badge>
                  <p className="mt-2 font-medium">{w.dishName} · {waste.weekdays[w.weekday]}</p>
                  <p className="text-sm text-muted-foreground">{num(w.plates)} plates · {inr(w.cost)}. Lower the risk weight or prep closer to the likely forecast on this day.</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
