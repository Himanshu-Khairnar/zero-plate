"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stat } from "@/components/page-header";
import { formatDate } from "@/lib/dates";
import { inr, num, qtyWithUnit } from "@/lib/format";
import { ingredientNeeds } from "@/lib/prep";
import type { PlanView } from "@/lib/prep-plans";

export function PrepPlanEditor({ plan: initial, outletId }: { plan: PlanView; outletId: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState(initial);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(initial.items.map((i) => [i.dishId, i.plannedQty])));
  const [reason, setReason] = useState("");
  const [who, setWho] = useState("Manager");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const locked = plan.status === "LOCKED";
  const changed = plan.items.filter((i) => qty[i.dishId] !== i.plannedQty);
  const ingredients = useMemo(
    () => ingredientNeeds(plan.items.map((i) => ({ dishName: i.dishName, plannedQty: qty[i.dishId] ?? 0, recipe: i.recipe }))),
    [plan.items, qty],
  );
  const totals = useMemo(() => {
    const plates = plan.items.reduce((s, i) => s + (qty[i.dishId] ?? 0), 0);
    const cost = plan.items.reduce((s, i) => s + (qty[i.dishId] ?? 0) * i.costPerPlate, 0);
    return { plates, cost };
  }, [plan.items, qty]);

  function apply(next: PlanView) {
    setPlan(next);
    setQty(Object.fromEntries(next.items.map((i) => [i.dishId, i.plannedQty])));
    router.refresh();
  }

  async function post(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
    return data as PlanView;
  }

  function save() {
    setError(null);
    start(async () => {
      try {
        apply(await post(`/api/prep-plans/${plan.id}`, "PATCH", { adjustedBy: who, items: changed.map((i) => ({ dishId: i.dishId, plannedQty: qty[i.dishId], reason: reason || null })) }));
        setReason("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function approve() {
    setError(null);
    start(async () => {
      try {
        if (changed.length) {
          await post(`/api/prep-plans/${plan.id}`, "PATCH", { adjustedBy: who, items: changed.map((i) => ({ dishId: i.dishId, plannedQty: qty[i.dishId], reason: reason || null })) });
        }
        apply(await post(`/api/prep-plans/${plan.id}/approve`, "POST", { approvedBy: who }));
        setReason("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function regenerate() {
    setError(null);
    start(async () => {
      try {
        apply(await post("/api/prep-plans", "POST", { outletId, date: plan.date }));
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={<Badge variant={plan.status === "APPROVED" ? "default" : plan.status === "LOCKED" ? "destructive" : "secondary"}>{plan.status}</Badge>} hint={plan.approvedBy ? `approved by ${plan.approvedBy}` : "draft from forecast"} />
        <Stat label="Plates to prep" value={num(totals.plates)} hint={`forecast expects ${num(plan.totals.forecastLikely)} sold`} />
        <Stat label="Ingredient cost" value={inr(totals.cost)} hint="at current supplier prices" />
        <Stat label="Model" value={plan.modelVersion ?? "—"} hint={`${plan.items.length} dishes`} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Plates per dish · {formatDate(plan.date, { weekday: "long", day: "numeric", month: "long" })}</CardTitle>
            <CardDescription>
              Suggested = likely + risk weight × (high − likely). Cheap dishes lean towards the high forecast, costly ones towards the likely number.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/kitchen/prep?outlet=${outletId}&date=${plan.date}`} target="_blank" />}>
              <Printer data-icon="inline-start" /> Kitchen sheet
            </Button>
            {plan.status === "DRAFT" ? (
              <Button variant="outline" size="sm" onClick={regenerate} disabled={pending}>
                <RefreshCw data-icon="inline-start" /> Re-forecast
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dish</TableHead>
                <TableHead className="text-right">Low</TableHead>
                <TableHead className="text-right">Likely</TableHead>
                <TableHead className="text-right">High</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                <TableHead className="text-right">Suggested</TableHead>
                <TableHead className="w-28 text-right">Prep</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.items.map((i) => {
                const q = qty[i.dishId] ?? 0;
                const dirty = q !== i.plannedQty;
                return (
                  <TableRow key={i.id} className={dirty ? "bg-primary/15 dark:bg-primary/20" : undefined}>
                    <TableCell>
                      <div className="font-medium">{i.dishName}</div>
                      <div className="max-w-sm truncate text-[11px] text-muted-foreground" title={i.explanation ?? undefined}>
                        {i.explanation}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Math.round(i.forecastLow)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(i.forecastLikely)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Math.round(i.forecastHigh)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" title={`Cost ${inr(i.costPerPlate)} per plate`}>
                        {i.riskWeight >= 0.75 ? "lean high" : i.riskWeight <= 0.35 ? "lean likely" : "balanced"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.suggestedQty}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={q}
                        disabled={locked}
                        onChange={(e) => setQty({ ...qty, [i.dishId]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        className="h-9 w-24 text-right text-base tabular-nums md:h-8 md:text-sm"
                        aria-label={`Plates of ${i.dishName}`}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{inr(q * i.costPerPlate)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell colSpan={4} />
                <TableCell className="text-right tabular-nums">{num(plan.items.reduce((s, i) => s + i.suggestedQty, 0))}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{num(totals.plates)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{inr(totals.cost)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {!locked ? (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 md:flex-row md:items-end">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="reason" className="text-xs">Reason for changes (logged with each adjustment)</Label>
                <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. college event nearby, expecting more students" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="who" className="text-xs">Your name</Label>
                <Input id="who" value={who} onChange={(e) => setWho(e.target.value)} className="w-40" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="default" onClick={() => setQty(Object.fromEntries(plan.items.map((i) => [i.dishId, i.plannedQty])))} disabled={!changed.length || pending}>
                  <RotateCcw data-icon="inline-start" /> Reset
                </Button>
                <Button variant="secondary" size="default" onClick={save} disabled={!changed.length || pending}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  Save {changed.length ? `(${changed.length})` : ""}
                </Button>
                <Button size="default" onClick={approve} disabled={pending || (plan.status === "APPROVED" && !changed.length)}>
                  <CheckCircle2 data-icon="inline-start" /> {plan.status === "APPROVED" ? "Re-approve" : "Approve plan"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">The day has been closed; the plan is locked.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Ingredients to prepare</CardTitle>
            <CardDescription>From the recipes, for the quantities above. Updates live as you edit.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="hidden md:table-cell">Used in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingredients.map((n) => (
                  <TableRow key={n.ingredientId}>
                    <TableCell className="font-medium">{n.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{qtyWithUnit(n.qty, n.unit)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{inr(n.cost)}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{n.dishes.map((d) => d.dishName).join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Adjustment log</CardTitle>
            <CardDescription>Every manual change, so overrides can be audited and learned from.</CardDescription>
          </CardHeader>
          <CardContent>
            {plan.adjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No adjustments yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {plan.adjustments.map((a) => (
                  <li key={a.id} className="rounded-lg border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.dishName}</span>
                      <span className="tabular-nums">
                        {a.fromQty} → <strong>{a.toQty}</strong>
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.adjustedBy} · {new Date(a.createdAt).toLocaleString("en-IN")}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
