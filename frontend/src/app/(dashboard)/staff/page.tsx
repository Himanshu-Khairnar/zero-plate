import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { InviteStaffDialog } from "@/components/dashboard/invite-staff-dialog";
import { PageHeader, Stat } from "@/components/page-header";
import { StaffManager } from "@/components/staff/staff-manager";
import { requireViewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Staff" };

export default function StaffPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Staff />
    </Suspense>
  );
}

async function Staff() {
  const viewer = await requireViewer();
  if (!viewer.organizationId || (viewer.role !== "OWNER" && viewer.role !== "MANAGER")) redirect("/dashboard");
  const orgId = viewer.organizationId;
  const [users, invites, outlets] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: orgId }, orderBy: [{ role: "asc" }, { name: "asc" }], include: { outlets: { include: { outlet: { select: { id: true, name: true } } } } } }),
    prisma.invitation.findMany({ where: { organizationId: orgId, acceptedAt: null }, orderBy: { createdAt: "desc" }, include: { outlet: { select: { name: true } } } }),
    prisma.outlet.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const canEdit = viewer.role === "OWNER";
  const byRole = (r: string) => users.filter((u) => u.role === r).length;

  return (
    <>
      <PageHeader title="Staff management" description="Invite managers and kitchen staff, assign them to outlets and set their roles.">
        <InviteStaffDialog outlets={outlets} />
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Team members" value={users.length} />
        <Stat label="Managers" value={byRole("MANAGER")} />
        <Stat label="Kitchen staff" value={byRole("KITCHEN_STAFF")} />
        <Stat label="Pending invites" value={invites.filter((i) => i.expiresAt > new Date()).length} hint={invites.length ? `${invites.filter((i) => i.expiresAt <= new Date()).length} expired` : undefined} />
      </div>
      <StaffManager
        viewerId={viewer.id}
        canEdit={canEdit}
        outlets={outlets}
        users={users.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email, role: u.role, createdAt: u.createdAt.toISOString(), outlets: u.outlets.map((o) => o.outlet) }))}
        invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, outletName: i.outlet?.name ?? null, expiresAt: i.expiresAt.toISOString(), expired: i.expiresAt <= new Date() }))}
      />
    </>
  );
}
