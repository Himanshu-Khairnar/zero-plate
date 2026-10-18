import { Suspense } from "react";
import { AlertTriangle, Clock, Package, ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { inr } from "@/lib/format";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { stockRows } from "@/lib/stock";

export const metadata = { title: "Inventory & orders" };

type Search = Promise<{ outlet?: string; tab?: string }>;

export default function InventoryPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Inventory searchParams={searchParams} />
    </Suspense>
  );
}

async function Inventory({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { viewer, outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const canEdit = viewer.role === "OWNER" || viewer.role === "MANAGER";

  const [stock, suppliers, orders, ingredients] = await Promise.all([
    stockRows(outlet.id),
    prisma.supplier.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" }, include: { prices: true, _count: { select: { purchaseOrders: { where: { status: { in: ["SUGGESTED", "ORDERED"] } } } } } } }),
    prisma.purchaseOrder.findMany({ where: { outletId: outlet.id }, orderBy: { createdAt: "desc" }, take: 60, include: { supplier: true, items: { include: { ingredient: true } } } }),
    prisma.ingredient.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, costPerUnit: true } }),
  ]);

  const low = stock.filter((r) => r.status !== "OK").length;
  const expiring = stock.filter((r) => r.expiryState === "soon" || r.expiryState === "expired").length;
  const openValue = orders.filter((o) => o.status === "SUGGESTED" || o.status === "ORDERED").reduce((s, o) => s + o.items.reduce((t, i) => t + i.qty * i.unitPrice, 0), 0);
  const stockValue = stock.reduce((s, r) => s + r.onHand * r.costPerUnit, 0);

  return (
    <>
      <PageHeader title="Inventory & orders" description="What is in stock, what to use first, and what to order so the kitchen never runs short.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Low or out" value={low} hint={`of ${stock.length} ingredients`} tone={low ? "bad" : "good"} icon={<AlertTriangle />} />
        <Stat label="Expiring in 2 days" value={expiring} hint="use first" tone={expiring ? "bad" : "good"} icon={<Clock />} />
        <Stat label="Open orders" value={inr(openValue)} hint="suggested + ordered" icon={<ShoppingCart />} />
        <Stat label="Stock value" value={inr(stockValue)} hint="at current cost" icon={<Package />} />
      </div>

      <InventoryManager
        outletId={outlet.id}
        canEdit={canEdit}
        initialTab={sp.tab}
        stock={stock}
        ingredients={ingredients}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, contact: s.contact, leadTimeDays: s.leadTimeDays, prices: s.prices.map((p) => ({ ingredientId: p.ingredientId, price: p.price })), openOrders: s._count.purchaseOrders }))}
        orders={orders.map((o) => ({
          id: o.id,
          status: o.status as "SUGGESTED" | "ORDERED" | "RECEIVED" | "CANCELLED",
          supplierName: o.supplier?.name ?? null,
          leadTimeDays: o.supplier?.leadTimeDays ?? null,
          expectedDate: o.expectedDate,
          note: o.note,
          createdBy: o.createdBy,
          createdAt: o.createdAt.toISOString(),
          receivedAt: o.receivedAt?.toISOString() ?? null,
          items: o.items.map((i) => ({ ingredientId: i.ingredientId, name: i.ingredient.name, unit: i.ingredient.unit, qty: i.qty, unitPrice: i.unitPrice })),
        }))}
      />
    </>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
