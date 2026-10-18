import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriftChart, type DriftPoint } from "@/components/admin/drift-chart";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { pct } from "@/lib/format";
import { requireViewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Model drift" };

const DRIFT_THRESHOLD = 1.2; // latest MAPE more than 20% worse than the best historical MAPE

export default function ModelDriftPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ModelDrift />
    </Suspense>
  );
}

async function ModelDrift() {
  const viewer = await requireViewer();
  if (viewer.role !== "PLATFORM_ADMIN") redirect("/dashboard");

  const runs = await prisma.modelRun.findMany({
    orderBy: { trainedAt: "asc" },
    include: { outlet: { select: { id: true, name: true, organization: { select: { name: true } } } } },
  });
  if (runs.length === 0) return <EmptyState title="No training runs yet">The weekly job writes a ModelRun per outlet; nothing has been trained on this platform so far.</EmptyState>;

  const parse = (s: string) => {
    try {
      return JSON.parse(s) as { improvement_vs_naive_pct?: number | null; winner?: string; features?: { scope?: string } };
    } catch {
      return null;
    }
  };

  const byOutlet = new Map<string, typeof runs>();
  for (const r of runs) byOutlet.set(r.outletId, [...(byOutlet.get(r.outletId) ?? []), r]);

  const series: Record<string, DriftPoint[]> = {};
  const summary = [...byOutlet.entries()].map(([outletId, list]) => {
    const name = list[0].outlet.name;
    series[name] = list.map((r) => ({
      trainedAt: r.trainedAt.toISOString(),
      label: r.trainedAt.toISOString().slice(0, 16).replace("T", " "),
      mae: r.mae,
      mape: r.mape,
      outlet: name,
    }));
    const latest = list[list.length - 1];
    const active = list.find((r) => r.isActive) ?? latest;
    const bestMape = Math.min(...list.map((r) => r.mape));
    const drifting = latest.mape > bestMape * DRIFT_THRESHOLD && list.length > 1;
    const cmp = parse(active.metricsJson);
    return { outletId, name, org: list[0].outlet.organization.name, runs: list.length, latest, active, bestMape, drifting, improvement: cmp?.improvement_vs_naive_pct ?? null, scope: cmp?.features?.scope ?? "outlet" };
  });
  const drifting = summary.filter((s) => s.drifting).length;
  const avgMape = summary.reduce((s, x) => s + x.active.mape, 0) / summary.length;
  const avgCoverage = summary.reduce((s, x) => s + x.active.coverage, 0) / summary.length;

  return (
    <>
      <PageHeader title="Model accuracy drift" description="Backtest accuracy of every outlet's model over time. A drift flag means the latest run is more than 20% worse than that outlet's best." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outlets with models" value={summary.length} hint={`${runs.length} training runs in total`} />
        <Stat label="Average MAPE" value={pct(avgMape, 1)} hint="active models" tone={avgMape < 20 ? "good" : undefined} />
        <Stat label="Average coverage" value={pct(avgCoverage * 100, 0)} hint="target ≥ 80% inside range" tone={avgCoverage >= 0.8 ? "good" : "muted"} />
        <Stat label="Drifting" value={drifting} hint={drifting ? "needs a look" : "all stable"} tone={drifting ? "bad" : "good"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accuracy over training runs</CardTitle>
          <CardDescription>Lower is better. Each point is one weekly retrain (or a manual &ldquo;retrain now&rdquo;).</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="mape">
            <TabsList>
              <TabsTrigger value="mape">MAPE %</TabsTrigger>
              <TabsTrigger value="mae">MAE (plates)</TabsTrigger>
            </TabsList>
            <TabsContent value="mape"><DriftChart series={series} metric="mape" /></TabsContent>
            <TabsContent value="mae"><DriftChart series={series} metric="mae" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active model per outlet</CardTitle>
          <CardDescription>Compared against the &ldquo;same day last week&rdquo; baseline on the last 4 weeks.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outlet</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">MAE</TableHead>
                <TableHead className="text-right">MAPE</TableHead>
                <TableHead className="text-right">Best MAPE</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
                <TableHead className="text-right">vs naive</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((s) => (
                <TableRow key={s.outletId}>
                  <TableCell className="font-medium">
                    {s.name}
                    <div className="text-xs text-muted-foreground">{s.org}</div>
                  </TableCell>
                  <TableCell>
                    {s.active.modelName} <Badge variant="outline" className="ml-1 text-[10px]">{s.scope}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.active.version}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.active.mae.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(s.active.mape, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{pct(s.bestMape, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(s.active.coverage * 100, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.improvement != null ? `${s.improvement > 0 ? "−" : "+"}${Math.abs(s.improvement).toFixed(0)}%` : "—"}</TableCell>
                  <TableCell>{s.drifting ? <Badge variant="destructive">drift</Badge> : <Badge variant="secondary">stable</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
