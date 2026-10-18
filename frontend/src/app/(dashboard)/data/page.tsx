import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SheetImport } from "@/components/data/sheet-import";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Data sheets" };

type Search = Promise<{ outlet?: string }>;

export default function DataPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}

async function Data({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { viewer, outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const [dishes, ingredients, recipes, lastImport] = await Promise.all([
    prisma.dish.count({ where: { outletId: outlet.id } }),
    prisma.ingredient.count({ where: { outletId: outlet.id } }),
    prisma.recipeItem.count({ where: { dish: { outletId: outlet.id } } }),
    prisma.auditLog.findFirst({ where: { outletId: outlet.id, action: "sheet.import" }, orderBy: { createdAt: "desc" } }),
  ]);
  const canEdit = viewer.role === "OWNER" || viewer.role === "MANAGER";

  return (
    <>
      <PageHeader title="Data sheets" description="Give the outlet's data as a spreadsheet, edit it anywhere, and upload it back to update menu, recipes, ingredients and stock in one go.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Dishes" value={dishes} />
        <Stat label="Ingredients" value={ingredients} />
        <Stat label="Recipe lines" value={recipes} />
        <Stat label="Last sheet import" value={lastImport ? lastImport.createdAt.toLocaleDateString("en-IN") : "—"} hint={lastImport ? `by ${lastImport.userName}` : "none yet"} />
      </div>
      {canEdit ? <SheetImport outletId={outlet.id} /> : <EmptyState title="Read-only">Only owners and managers can upload data sheets.</EmptyState>}
    </>
  );
}
