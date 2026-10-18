import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { suggestSurplus } from "@/actions/donations";
import { DonationsPanel } from "@/components/donations/donations-panel";
import { EmptyState, PageHeader } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { today } from "@/lib/dates";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Surplus & donations" };

type Search = Promise<{ outlet?: string }>;

export default function DonationsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Donations searchParams={searchParams} />
    </Suspense>
  );
}

async function Donations({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { viewer, outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const monthStart = `${today().slice(0, 7)}-01`;

  const [surplus, ngos, donations, month, allTime] = await Promise.all([
    suggestSurplus(outlet.id, today()),
    prisma.ngo.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }] }),
    prisma.donation.findMany({ where: { outletId: outlet.id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50, include: { ngo: { select: { id: true, name: true } } } }),
    prisma.donation.aggregate({ where: { outletId: outlet.id, status: "COLLECTED", date: { gte: monthStart } }, _sum: { meals: true } }),
    prisma.donation.aggregate({ where: { outletId: outlet.id, status: "COLLECTED" }, _sum: { meals: true }, _count: true }),
  ]);

  return (
    <>
      <PageHeader title="Surplus & donations" description="Turn unavoidable leftovers into meals. Suggestions come from the approved prep plan and today's kitchen board.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>
      <DonationsPanel
        outletId={outlet.id}
        city={outlet.city}
        surplus={surplus}
        ngos={ngos}
        donations={donations.map((d) => ({ id: d.id, date: d.date, meals: d.meals, dishNames: d.dishNames, status: d.status, note: d.note, createdBy: d.createdBy, ngo: d.ngo }))}
        totals={{ month: month._sum.meals ?? 0, allTime: allTime._sum.meals ?? 0, count: allTime._count }}
        canManageNgos={viewer.role === "OWNER" || viewer.role === "MANAGER" || viewer.role === "PLATFORM_ADMIN"}
      />
    </>
  );
}
