"use client";

import { useState, useTransition } from "react";
import { CloudRain, FlaskConical, Loader2, Pin, Play, Sun, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, formatDate, today } from "@/lib/dates";
import { inr, num, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WhatIfLine, WhatIfTotals } from "@/app/api/whatif/route";

type Dish = { id: string; name: string; category: string };

type Result = {
  date: string;
  modelVersion: string;
  assumed: { rainMm: number | null; tempMax: number | null; isHoliday: boolean; holidayName: string | null; isWeekend: boolean };
  baseline: { rows: WhatIfLine[]; totals: WhatIfTotals };
  scenario_result: { rows: WhatIfLine[]; totals: WhatIfTotals };
};

type Pinned = { name: string; date: string; totals: WhatIfTotals; summary: string };

type Controls = {
  date: string;
  rainOn: boolean;
  rainMm: number;
  tempOn: boolean;
  tempMax: number;
  holiday: boolean;
  discountOn: boolean;
  discountPct: number;
  dishIds: string[];
};

export function WhatIfSimulator({ outletId, dishes }: { outletId: string; dishes: Dish[] }) {
  const [c, setC] = useState<Controls>({
    date: addDays(today(), 1),
    rainOn: false,
    rainMm: 25,
    tempOn: false,
    tempMax: 36,
    holiday: false,
    discountOn: false,
    discountPct: 15,
    dishIds: dishes.map((d) => d.id),
  });
  const [result, setResult] = useState<Result | null>(null);
  const [pinned, setPinned] = useState<Pinned[]>([]);
  const [pending, start] = useTransition();

  const summary =
    [c.rainOn ? `${c.rainMm} mm rain` : null, c.tempOn ? `${c.tempMax}°C` : null, c.holiday ? "holiday" : null, c.discountOn ? `${c.discountPct}% off` : null]
      .filter(Boolean)
      .join(", ") || "no changes";

  function run() {
    start(async () => {
      try {
        const scenario = {
          rainMm: c.rainOn ? c.rainMm : undefined,
          tempMax: c.tempOn ? c.tempMax : undefined,
          isHoliday: c.holiday ? true : undefined,
          discountPct: c.discountOn ? c.discountPct : undefined,
          dishIds: c.dishIds.length === dishes.length ? undefined : c.dishIds,
        };
        const res = await fetch("/api/whatif", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outletId, date: c.date, scenario }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        setResult(data as Result);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function pin() {
    if (!result) return;
    setPinned([...pinned, { name: `Scenario ${pinned.length + 1}`, date: result.date, totals: result.scenario_result.totals, summary }]);
    toast.success("Pinned for comparison");
  }

  const t0 = result?.baseline.totals;
  const t1 = result?.scenario_result.totals;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1 lg:self-start">
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
          <CardDescription>Switch a condition on to override what the model assumes for that day.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wi-date">Day</Label>
            <Input id="wi-date" type="date" min={today()} max={addDays(today(), 13)} value={c.date} onChange={(e) => e.target.value && setC({ ...c, date: e.target.value })} />
          </div>

          <Control icon={<CloudRain />} label="Rain" on={c.rainOn} onToggle={(v) => setC({ ...c, rainOn: v })} value={`${c.rainMm} mm`}>
            <Slider min={0} max={120} step={5} value={[c.rainMm]} disabled={!c.rainOn} onValueChange={(v) => setC({ ...c, rainMm: Array.isArray(v) ? v[0] : v })} />
          </Control>
          <Control icon={<Sun />} label="Max temperature" on={c.tempOn} onToggle={(v) => setC({ ...c, tempOn: v })} value={`${c.tempMax}°C`}>
            <Slider min={22} max={44} step={1} value={[c.tempMax]} disabled={!c.tempOn} onValueChange={(v) => setC({ ...c, tempMax: Array.isArray(v) ? v[0] : v })} />
          </Control>
          <Control icon={<Tag />} label="Discount on selected dishes" on={c.discountOn} onToggle={(v) => setC({ ...c, discountOn: v })} value={`${c.discountPct}% off`}>
            <Slider min={5} max={50} step={5} value={[c.discountPct]} disabled={!c.discountOn} onValueChange={(v) => setC({ ...c, discountPct: Array.isArray(v) ? v[0] : v })} />
          </Control>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="wi-holiday" className="text-sm">Treat as a public holiday</Label>
            <Switch id="wi-holiday" checked={c.holiday} onCheckedChange={(v) => setC({ ...c, holiday: v })} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Dishes</Label>
              <Button variant="link" size="xs" onClick={() => setC({ ...c, dishIds: c.dishIds.length === dishes.length ? [] : dishes.map((d) => d.id) })}>
                {c.dishIds.length === dishes.length ? "Clear" : "Select all"}
              </Button>
            </div>
            <ToggleGroup multiple value={c.dishIds} onValueChange={(v) => setC({ ...c, dishIds: v as string[] })} variant="outline" size="sm" className="flex-wrap justify-start gap-1.5" spacing={1}>
              {dishes.map((d) => (
                <ToggleGroupItem key={d.id} value={d.id} className="rounded-full px-3">
                  {d.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Button onClick={run} disabled={pending || c.dishIds.length === 0} size="lg">
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            Run scenario
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-2">
        {result && t0 && t1 ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {formatDate(result.date, { weekday: "long", day: "numeric", month: "long" })} · {summary}
                </CardTitle>
                <CardDescription>
                  Model assumes {result.assumed.rainMm != null ? `${result.assumed.rainMm} mm rain` : "unknown rain"},{" "}
                  {result.assumed.tempMax != null ? `${result.assumed.tempMax}°C` : "unknown temperature"}
                  {result.assumed.isHoliday ? `, ${result.assumed.holidayName ?? "public holiday"}` : ""}
                  {result.assumed.isWeekend ? ", weekend" : ""}. Model {result.modelVersion}.
                </CardDescription>
                <Button variant="outline" size="sm" onClick={pin} className="sm:absolute sm:top-5 sm:right-5">
                  <Pin data-icon="inline-start" /> Pin
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Delta label="Expected demand" unit="plates" base={t0.likely} next={t1.likely} goodWhen="up" />
                <Delta label="Plates to prep" unit="plates" base={t0.prepQty} next={t1.prepQty} goodWhen="none" />
                <Delta label="Prep cost" money base={t0.prepCost} next={t1.prepCost} goodWhen="down" />
                <Delta label="Expected waste" money base={t0.wasteCost} next={t1.wasteCost} goodWhen="down" hint={`${num(t0.wastePlates)} → ${num(t1.wastePlates)} plates`} />
                <Delta label="Expected revenue" money base={t0.expectedRevenue} next={t1.expectedRevenue} goodWhen="up" />
                <Delta label="Lost sales (under-prep)" money base={t0.lostSales} next={t1.lostSales} goodWhen="down" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Per dish</CardTitle>
                <CardDescription>Baseline → scenario. Prep quantities use the same risk-aware rule as the daily plan.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dish</TableHead>
                      <TableHead className="text-right">Likely</TableHead>
                      <TableHead className="text-right">Prep</TableHead>
                      <TableHead className="text-right">Prep cost</TableHead>
                      <TableHead className="text-right">Waste cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.scenario_result.rows.map((s) => {
                      const b = result.baseline.rows.find((r) => r.dishId === s.dishId);
                      return (
                        <TableRow key={s.dishId}>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger render={<span className="cursor-help font-medium underline decoration-dotted underline-offset-4" />}>{s.dishName}</TooltipTrigger>
                              <TooltipContent className="max-w-xs">{s.explanation}</TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right tabular-nums"><Pair base={b?.likely} next={s.likely} /></TableCell>
                          <TableCell className="text-right tabular-nums"><Pair base={b?.prepQty} next={s.prepQty} /></TableCell>
                          <TableCell className="text-right tabular-nums"><Pair base={b?.prepCost} next={s.prepCost} money /></TableCell>
                          <TableCell className="text-right tabular-nums"><Pair base={b?.wasteCost} next={s.wasteCost} money /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Empty className="min-h-80 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FlaskConical />
              </EmptyMedia>
              <EmptyTitle>No scenario yet</EmptyTitle>
              <EmptyDescription>Set conditions on the left and run a scenario to see demand, cost and waste change.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {pinned.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Side by side</CardTitle>
              <CardDescription>Pinned scenarios compared on totals.</CardDescription>
              <Button variant="ghost" size="sm" onClick={() => setPinned([])} className="sm:absolute sm:top-5 sm:right-5">
                <Trash2 data-icon="inline-start" /> Clear
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scenario</TableHead>
                    <TableHead className="text-right">Demand</TableHead>
                    <TableHead className="text-right">Prep</TableHead>
                    <TableHead className="text-right">Prep cost</TableHead>
                    <TableHead className="text-right">Waste cost</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t0 && result ? (
                    <TableRow className="text-muted-foreground">
                      <TableCell>
                        Baseline · {formatDate(result.date)} <Badge variant="outline" className="ml-1">as forecast</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(t0.likely)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(t0.prepQty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(t0.prepCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(t0.wasteCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(t0.expectedRevenue)}</TableCell>
                    </TableRow>
                  ) : null}
                  {pinned.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell>
                        <span className="font-medium">{p.name}</span> · {formatDate(p.date)} <span className="text-xs text-muted-foreground">({p.summary})</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(p.totals.likely)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(p.totals.prepQty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(p.totals.prepCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(p.totals.wasteCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(p.totals.expectedRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Control({ icon, label, on, onToggle, value, children }: { icon: React.ReactNode; label: string; on: boolean; onToggle: (v: boolean) => void; value: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-3 transition-opacity", !on && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-2 text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon} {label}
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
          <Switch checked={on} onCheckedChange={onToggle} size="sm" />
        </div>
      </div>
      {children}
    </div>
  );
}

function Delta({ label, base, next, money, unit, goodWhen, hint }: { label: string; base: number; next: number; money?: boolean; unit?: string; goodWhen: "up" | "down" | "none"; hint?: string }) {
  const diff = next - base;
  const fmt = (n: number) => (money ? inr(n) : `${num(n)}${unit ? ` ${unit}` : ""}`);
  const good = goodWhen === "none" || diff === 0 ? null : (diff > 0) === (goodWhen === "up");
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(next)}</p>
      <p className={cn("text-xs tabular-nums", good == null ? "text-muted-foreground" : good ? "text-primary" : "text-foreground")}>
        {money ? `${diff >= 0 ? "+" : "−"}${inr(Math.abs(diff))}` : `${signed(diff)}${unit ? ` ${unit}` : ""}`} vs {fmt(base)}
        {base > 0 ? ` (${signed((diff / base) * 100, 0)}%)` : ""}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Pair({ base, next, money }: { base?: number; next: number; money?: boolean }) {
  const fmt = (n: number) => (money ? inr(n) : String(Math.round(n)));
  if (base == null) return <>{fmt(next)}</>;
  const diff = next - base;
  return (
    <>
      <span className="text-muted-foreground">{fmt(base)}</span>
      <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />
      <strong>{fmt(next)}</strong>
      {Math.abs(diff) >= (money ? 1 : 0.5) ? (
        <Badge variant="secondary" className={cn("ml-1.5 tabular-nums", diff > 0 ? "text-primary/80" : "text-primary")}>
          {money ? `${diff > 0 ? "+" : "−"}${inr(Math.abs(diff))}` : signed(Math.round(diff))}
        </Badge>
      ) : null}
    </>
  );
}
