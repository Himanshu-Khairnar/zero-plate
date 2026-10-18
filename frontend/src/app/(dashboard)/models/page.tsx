import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { num, pct } from "@/lib/format";
import type { TrainResult } from "@/lib/ml";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Models" };

type Search = Promise<{ outlet?: string }>;
type Comparison = Pick<TrainResult, "winner" | "results" | "improvement_vs_naive_pct" | "model_info" | "train_rows"> & {
  features?: { scope: string; history_days: number; train_start: string; train_end: string };
};

const MODEL_LABEL: Record<string, string> = {
  naive: "Same day last week (baseline)",
  seasonal_naive: "Average of last 4 same weekdays",
  lightgbm: "LightGBM (Poisson, all dishes)",
  prophet: "Prophet (per dish)",
};

export default function ModelsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Models searchParams={searchParams} />
    </Suspense>
  );
}

async function Models({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet">Seed the demo data first.</EmptyState>;
  const runs = await prisma.modelRun.findMany({ where: { outletId: outlet.id }, orderBy: { trainedAt: "desc" }, take: 20 });
  const active = runs.find((r) => r.isActive) ?? null;
  const parse = (s: string): Comparison | null => {
    try {
      return JSON.parse(s) as Comparison;
    } catch {
      return null;
    }
  };
  const cmp = active ? parse(active.metricsJson) : null;
  const importance = Object.entries(cmp?.model_info?.feature_importance ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <>
      <PageHeader title="Forecasting models" description="Every week the candidates are backtested on the last 4 weeks and the most accurate one is promoted.">
        <OutletPicker outlets={outlets} value={outlet.id} />
        <ActionButton url="/api/models" body={{ outletId: outlet.id, promote: true }} successText="Retrained and promoted">
          Retrain now
        </ActionButton>
      </PageHeader>

      {!active || !cmp ? (
        <EmptyState title="No trained model for this outlet yet">Click &ldquo;Retrain now&rdquo; (the ML service must be running) or let the weekly job do it.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Active model" value={MODEL_LABEL[active.modelName]?.split(" (")[0] ?? active.modelName} hint={`${active.version} · ${cmp.features?.scope === "global" ? "global (cold start)" : "per-outlet"}`} />
            <Stat label="MAE on backtest" value={`${active.mae.toFixed(2)} plates`} hint={`MAPE ${pct(active.mape, 1)} · sMAPE ${pct(cmp.results.find((r) => r.model === active.modelName)?.overall?.smape ?? 0, 1)}`} />
            <Stat label="vs. last-week baseline" value={cmp.improvement_vs_naive_pct != null ? `${cmp.improvement_vs_naive_pct > 0 ? "−" : "+"}${Math.abs(cmp.improvement_vs_naive_pct).toFixed(1)}% error` : "—"} tone={cmp.improvement_vs_naive_pct != null && cmp.improvement_vs_naive_pct > 0 ? "good" : "bad"} hint="plan objective 1: beat the naive baseline" />
            <Stat label="Range coverage" value={pct(active.coverage * 100, 0)} tone={active.coverage >= 0.8 ? "good" : "muted"} hint="target ≥ 80% of actuals inside low–high" />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Model comparison</CardTitle>
                <CardDescription>
                  Rolling-origin backtest, 4 weekly folds, 7-day horizon, {num(cmp.train_rows)} training rows ({cmp.features?.train_start} → {cmp.features?.train_end}).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">MAE</TableHead>
                      <TableHead className="text-right">MAPE</TableHead>
                      <TableHead className="text-right">Bias</TableHead>
                      <TableHead className="text-right">Coverage</TableHead>
                      <TableHead className="text-right">Range</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cmp.results.map((r) => (
                      <TableRow key={r.model} className={r.model === cmp.winner ? "bg-primary/5" : undefined}>
                        <TableCell className="font-medium">
                          {MODEL_LABEL[r.model] ?? r.model}
                          {r.model === cmp.winner ? <Badge className="ml-2">winner</Badge> : null}
                          {r.error ? <span className="ml-2 text-xs text-destructive">{r.error}</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.overall ? r.overall.mae.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.overall ? pct(r.overall.mape, 1) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.overall ? r.overall.bias.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.overall ? pct(r.overall.coverage * 100, 0) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.overall ? `±${(r.overall.range_width / 2).toFixed(0)}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-3 text-xs text-muted-foreground">
                  MAE: average absolute error in plates. MAPE: the same as a percentage of actual sales. Bias: negative means the model under-forecasts. Coverage: share of actual sales that fell inside the low–high range.
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>What drives the forecast</CardTitle>
                <CardDescription>Feature importance of the active model (split gain share).</CardDescription>
              </CardHeader>
              <CardContent>
                {importance.length === 0 ? (
                  <p className="text-sm text-muted-foreground">The active model is a baseline; it has no learned features.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {importance.map(([name, share]) => (
                      <li key={name} className="text-xs">
                        <div className="mb-0.5 flex justify-between">
                          <span className="font-medium">{FEATURE_LABEL[name] ?? name}</span>
                          <span className="tabular-nums text-muted-foreground">{pct(share * 100, 1)}</span>
                        </div>
                        <div className="h-1.5 rounded bg-muted">
                          <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.min(100, (share / importance[0][1]) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {cmp.model_info?.dispersion ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Range width calibrated on a 14-day holdout: dispersion {cmp.model_info.dispersion.toFixed(2)}, z {cmp.model_info.z?.toFixed(2)}.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Training history</CardTitle>
          <CardDescription>Accuracy over time, so drift is visible (surfaced on the admin panel, module N).</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No training runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Trained</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">MAE</TableHead>
                  <TableHead className="text-right">MAPE</TableHead>
                  <TableHead className="text-right">Coverage</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.version}</TableCell>
                    <TableCell>{MODEL_LABEL[r.modelName]?.split(" (")[0] ?? r.modelName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.trainedAt.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.trainRows)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.mae.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.mape, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.coverage * 100, 0)}</TableCell>
                    <TableCell>{r.isActive ? <Badge>active</Badge> : null}</TableCell>
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

const FEATURE_LABEL: Record<string, string> = {
  dow: "Day of week",
  dom: "Day of month",
  month: "Month",
  is_weekend: "Weekend",
  is_holiday: "Public holiday",
  days_to_holiday: "Days to next holiday",
  days_from_holiday: "Days since holiday",
  is_payday: "Payday",
  temp_max: "Max temperature",
  temp_min: "Min temperature",
  rain_mm: "Rainfall",
  humidity: "Humidity",
  lag_7: "Sales 7 days ago",
  lag_14: "Sales 14 days ago",
  lag_21: "Sales 21 days ago",
  lag_28: "Sales 28 days ago",
  lag_mean4: "Avg of last 4 same weekdays",
  roll7_mean: "7-day average",
  roll7_std: "7-day variability",
  roll28_mean: "28-day average",
  roll28_std: "28-day variability",
  trend_ratio: "Recent trend",
  dish_code: "Dish",
  category_code: "Category",
  price: "Price",
  promo: "Promotion",
  days_since_launch: "Days since launch",
};
