import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { WasteCapture } from "@/components/waste/waste-capture";
import { EmptyState, PageHeader } from "@/components/page-header";
import { formatDate, today } from "@/lib/dates";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Photo waste capture" };

type Search = Promise<{ outlet?: string }>;

export default function KitchenWastePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Capture searchParams={searchParams} />
    </Suspense>
  );
}

async function Capture({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet is assigned to your account yet" />;
  const dishes = await prisma.dish.findMany({ where: { outletId: outlet.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  if (dishes.length === 0) return <EmptyState title="No dishes configured for this outlet yet">Ask a manager to add the menu first.</EmptyState>;

  return (
    <>
      <PageHeader title="Photo waste capture" description={`${outlet.name} · ${formatDate(today(), { weekday: "long", day: "numeric", month: "long" })}. Photograph leftovers, confirm what the model sees, done.`} />
      <WasteCapture outletId={outlet.id} dishes={dishes} />
    </>
  );
}
