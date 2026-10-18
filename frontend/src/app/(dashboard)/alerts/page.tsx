import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Alerts" };

type Search = Promise<{ outlet?: string }>;

export default function AlertsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Alerts searchParams={searchParams} />
    </Suspense>
  );
}

async function Alerts({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { viewer, outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const alerts = await prisma.alert.findMany({ where: { outletId: outlet.id }, orderBy: [{ isRead: "asc" }, { createdAt: "desc" }], take: 200 });
  const unread = alerts.filter((a) => !a.isRead);
  const critical = unread.filter((a) => a.severity === "critical").length;

  return (
    <>
      <PageHeader title="Alerts" description="Problems caught early: unusual sales days, low stock, expiring batches, forecast shortages and plans waiting for approval.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Unread" value={unread.length} hint={`${alerts.length} in the last 200`} />
        <Stat label="Critical" value={critical} tone={critical ? "bad" : "good"} hint="need action today" />
        <Stat label="Unusual sales days" value={unread.filter((a) => a.type === "anomaly").length} hint="from the nightly scan" />
      </div>
      <AlertsPanel
        outletId={outlet.id}
        canScan={viewer.role !== "KITCHEN_STAFF"}
        alerts={alerts.map((a) => ({ id: a.id, type: a.type, severity: a.severity, message: a.message, isRead: a.isRead, createdAt: a.createdAt.toISOString() }))}
      />
    </>
  );
}
