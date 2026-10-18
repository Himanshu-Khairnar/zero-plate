import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { MenuManager } from "@/components/menu/menu-manager";
import { EmptyState, PageHeader } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Menu & recipes" };

type Search = Promise<{ outlet?: string }>;

export default function MenuPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Menu searchParams={searchParams} />
    </Suspense>
  );
}

async function Menu({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { viewer, outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const [dishes, ingredients] = await Promise.all([
    prisma.dish.findMany({ where: { outletId: outlet.id }, orderBy: [{ category: "asc" }, { name: "asc" }], include: { recipeItems: true } }),
    prisma.ingredient.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" }, include: { _count: { select: { recipeItems: true } } } }),
  ]);
  const canEdit = viewer.role === "OWNER" || viewer.role === "MANAGER";

  return (
    <>
      <PageHeader title="Menu & recipes" description="What the outlet sells and what each plate is made of. Recipes drive prep lists, costs and purchase orders.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>
      <MenuManager
        outletId={outlet.id}
        canEdit={canEdit}
        dishes={dishes.map((d) => ({ id: d.id, name: d.name, category: d.category, price: d.price, isVeg: d.isVeg, isActive: d.isActive, recipe: d.recipeItems.map((r) => ({ ingredientId: r.ingredientId, qtyPerPlate: r.qtyPerPlate })) }))}
        ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit, shelfLifeDays: i.shelfLifeDays, usedIn: i._count.recipeItems }))}
      />
    </>
  );
}
