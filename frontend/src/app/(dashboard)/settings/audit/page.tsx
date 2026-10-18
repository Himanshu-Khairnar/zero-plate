import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditTable, type AuditSearch } from "@/components/admin/audit-table";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/outlets";

export const metadata = { title: "Activity log" };

type Search = Promise<AuditSearch>;

export default function OrgAuditPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OrgAudit searchParams={searchParams} />
    </Suspense>
  );
}

async function OrgAudit({ searchParams }: { searchParams: Search }) {
  const viewer = await requireViewer();
  if (viewer.role !== "OWNER" || !viewer.organizationId) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Activity log" description="Who changed what in your organisation: plans, menu, imports, inventory, staff." />
      <AuditTable search={sp} organizationId={viewer.organizationId} basePath="/settings/audit" />
    </>
  );
}
