import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { EmptyState } from "@/components/page-header";
import { formatDate, isIsoDate, tomorrow } from "@/lib/dates";
import { qtyWithUnit } from "@/lib/format";
import { resolveOutlet } from "@/lib/outlets";
import { getOrCreatePlan } from "@/lib/prep-plans";

export const metadata = { title: "Kitchen sheet" };

type Search = Promise<{ outlet?: string; date?: string }>;

export default function PrintPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Preparing the kitchen sheet…</p>}>
      <Sheet searchParams={searchParams} />
    </Suspense>
  );
}

async function Sheet({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const date = isIsoDate(sp.date) ? sp.date : tomorrow();
  const plan = await getOrCreatePlan(outlet.id, date);
  const byCategory = new Map<string, typeof plan.items>();
  for (const i of plan.items) byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i]);

  return (
    <div className="print-sheet mx-auto w-full max-w-3xl rounded-xl border bg-background p-6 text-foreground print:max-w-none print:border-0 print:p-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kitchen prep sheet</h1>
          <p className="text-sm text-muted-foreground">
            {outlet.name} · {formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.status === "APPROVED" ? `Approved by ${plan.approvedBy}` : `${plan.status} — not yet approved`} · model {plan.modelVersion ?? "—"}
          </p>
        </div>
        <PrintButton />
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Plates to prepare</h2>
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b-2 text-left text-sm uppercase tracking-wide text-muted-foreground">
            <th className="py-1">Dish</th>
            <th className="py-1 text-right">Plates</th>
            <th className="py-1 text-right">Range</th>
            <th className="w-28 py-1 text-right">Done ✓</th>
          </tr>
        </thead>
        <tbody>
          {[...byCategory.entries()].map(([cat, items]) => (
            <Fragment key={cat}>
              <tr>
                <td colSpan={4} className="pt-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">{cat}</td>
              </tr>
              {items.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="py-2 font-medium">{i.dishName}</td>
                  <td className="py-2 text-right text-xl font-bold tabular-nums">{i.plannedQty}</td>
                  <td className="py-2 text-right text-sm tabular-nums text-muted-foreground">
                    {Math.round(i.forecastLow)}–{Math.round(i.forecastHigh)}
                  </td>
                  <td className="py-2 text-right">
                    <span className="inline-block size-5 rounded border" />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 mb-2 text-lg font-semibold">Ingredients to take out</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 text-left text-sm uppercase tracking-wide text-muted-foreground">
            <th className="py-1">Ingredient</th>
            <th className="py-1 text-right">Quantity</th>
            <th className="py-1 pl-4">For</th>
          </tr>
        </thead>
        <tbody>
          {plan.ingredients.map((n) => (
            <tr key={n.ingredientId} className="border-b">
              <td className="py-1.5 font-medium">{n.name}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{qtyWithUnit(n.qty, n.unit)}</td>
              <td className="py-1.5 pl-4 text-xs text-muted-foreground">{n.dishes.map((d) => d.dishName).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {plan.notes ? <p className="mt-6 rounded border p-3 text-sm">Notes: {plan.notes}</p> : null}
      <p className="mt-6 text-xs text-muted-foreground">Total {plan.items.reduce((s, i) => s + i.plannedQty, 0)} plates · Zero Plate</p>
    </div>
  );
}

import { Fragment } from "react";
