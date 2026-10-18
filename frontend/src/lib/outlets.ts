import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type OutletSummary = { id: string; name: string; city: string; timezone: string };

export type Viewer = {
  id: string;
  name: string;
  role: "OWNER" | "MANAGER" | "KITCHEN_STAFF" | "PLATFORM_ADMIN";
  organizationId: string | null;
};

/** Signed-in user, or redirect to login. */
export async function requireViewer(): Promise<Viewer> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "User",
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  };
}

/** Outlets the viewer may see: assigned ones for staff/managers, all org outlets for owners, everything for admins. */
export async function listOutlets(viewer: Viewer): Promise<OutletSummary[]> {
  const select = { id: true, name: true, city: true, timezone: true };
  if (viewer.role === "PLATFORM_ADMIN") {
    return prisma.outlet.findMany({ orderBy: { name: "asc" }, select });
  }
  if (!viewer.organizationId) return [];
  if (viewer.role === "OWNER") {
    return prisma.outlet.findMany({ where: { organizationId: viewer.organizationId }, orderBy: { name: "asc" }, select });
  }
  const assigned = await prisma.outlet.findMany({
    where: { organizationId: viewer.organizationId, users: { some: { userId: viewer.id } } },
    orderBy: { name: "asc" },
    select,
  });
  if (assigned.length) return assigned;
  // Managers without an explicit assignment see their organisation's outlets.
  return prisma.outlet.findMany({ where: { organizationId: viewer.organizationId }, orderBy: { name: "asc" }, select });
}

/** The outlet from ?outlet= (if allowed), else the first visible one. */
export async function resolveOutlet(outletParam: string | undefined) {
  const viewer = await requireViewer();
  const outlets = await listOutlets(viewer);
  const outlet = outlets.find((o) => o.id === outletParam) ?? outlets[0] ?? null;
  return { viewer, outlet, outlets };
}

/** For route handlers: is this outlet visible to the viewer? */
export async function canAccessOutlet(viewer: Viewer, outletId: string): Promise<boolean> {
  const outlets = await listOutlets(viewer);
  return outlets.some((o) => o.id === outletId);
}
