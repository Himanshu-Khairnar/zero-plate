import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { WasteLog, type WasteRow } from "@/components/waste/waste-log";
import { EmptyState, PageHeader } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { addDays, today } from "@/lib/dates";
import { resolveOutlet } from "@/lib/outlets";
import { costPerPlate } from "@/lib/prep";
import { prisma } from "@/lib/prisma";
import type { WasteReason } from "@/lib/waste";

export const metadata = { title: "Waste log" };

type Search = Promise<{ outlet?: string; days?: string }>;

export default function WasteLogPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Waste searchParams={searchParams} />
    </Suspense>
  );
}

async function Waste({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { viewer, outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const days: 7 | 30 = sp.days === "30" ? 30 : 7;
  const since = addDays(today(), -(days - 1));

  const [logs, dishes, ingredients] = await Promise.all([
    prisma.wasteLog.findMany({
      where: { outletId: outlet.id, date: { gte: since } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { dish: { include: { recipeItems: { include: { ingredient: true } } } }, ingredient: true },
    }),
    prisma.dish.findMany({ where: { outletId: outlet.id, isActive: true }, orderBy: { name: "asc" }, include: { recipeItems: { include: { ingredient: true } } } }),
    prisma.ingredient.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" } }),
  ]);
  const dishCost = (d: { recipeItems: { qtyPerPlate: number; ingredient: { costPerUnit: number } }[] }) =>
    costPerPlate(d.recipeItems.map((r) => ({ qtyPerPlate: r.qtyPerPlate, costPerUnit: r.ingredient.costPerUnit })));

  const rows: WasteRow[] = logs.map((l) => ({
    id: l.id,
    date: l.date,
    qty: l.qty,
    reason: l.reason as WasteReason,
    note: l.note,
    photoUrl: l.photoUrl,
    aiLabel: l.aiLabel,
    aiConfidence: l.aiConfidence,
    loggedBy: l.loggedBy,
    createdAt: l.createdAt.toISOString(),
    dish: l.dish ? { id: l.dish.id, name: l.dish.name, costPerPlate: dishCost(l.dish) } : null,
    ingredient: l.ingredient ? { id: l.ingredient.id, name: l.ingredient.name, unit: l.ingredient.unit, costPerUnit: l.ingredient.costPerUnit } : null,
  }));

  return (
    <>
      <PageHeader title="Waste log" description="What was thrown away, why, and what it cost. Tagged by reason so you can fix the cause, not just the symptom.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>
      <WasteLog
        outletId={outlet.id}
        rows={rows}
        days={days}
        canDelete={viewer.role === "OWNER" || viewer.role === "MANAGER"}
        dishes={dishes.map((d) => ({ id: d.id, name: d.name, costPerPlate: dishCost(d) }))}
        ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit }))}
      />
    </>
  );
}
