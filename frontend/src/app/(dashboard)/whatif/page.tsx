import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { WhatIfSimulator } from "@/components/whatif-simulator";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "What-if" };

type Search = Promise<{ outlet?: string }>;

export default function WhatIfPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <WhatIf searchParams={searchParams} />
    </Suspense>
  );
}

async function WhatIf({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet">Seed the demo data first.</EmptyState>;
  const dishes = await prisma.dish.findMany({ where: { outletId: outlet.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true } });

  return (
    <>
      <PageHeader title="What-if simulator" description="Test a decision before making it: change the conditions and see demand, cost and waste move.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>
      <WhatIfSimulator key={outlet.id} outletId={outlet.id} dishes={dishes} />
    </>
  );
}
