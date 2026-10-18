import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditTable, type AuditSearch } from "@/components/admin/audit-table";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/outlets";

export const metadata = { title: "Audit logs" };

type Search = Promise<AuditSearch>;

export default function AuditLogsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AuditLogs searchParams={searchParams} />
    </Suspense>
  );
}

async function AuditLogs({ searchParams }: { searchParams: Search }) {
  const viewer = await requireViewer();
  if (viewer.role !== "PLATFORM_ADMIN") redirect("/dashboard");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Global audit logs" description="Every recorded action across all tenants." />
      <AuditTable search={sp} organizationId={undefined} basePath="/admin/audit-logs" />
    </>
  );
}
