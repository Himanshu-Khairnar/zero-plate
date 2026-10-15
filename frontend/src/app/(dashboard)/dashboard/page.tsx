import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { OwnerDashboard } from "@/components/dashboard/owner-dashboard"
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard"
import { KitchenDashboard } from "@/components/dashboard/kitchen-dashboard"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  const { id, role, organizationId } = session.user
  const displayName = session.user.name ?? session.user.email ?? "there"

  const organization = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      })
    : null

  if (role === "OWNER") {
    const outlets = organizationId
      ? await prisma.outlet.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : []

    return (
      <OwnerDashboard
        name={displayName}
        organizationName={organization?.name ?? null}
        outlets={outlets}
      />
    )
  }

  if (role === "MANAGER") {
    const assignment = await prisma.userOutlet.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "asc" },
      include: { outlet: { select: { name: true } } },
    })

    return (
      <ManagerDashboard
        name={displayName}
        organizationName={organization?.name ?? null}
        outletName={assignment?.outlet.name ?? null}
      />
    )
  }

  if (role === "KITCHEN_STAFF") {
    const assignment = await prisma.userOutlet.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "asc" },
      include: { outlet: { select: { name: true } } },
    })

    return (
      <KitchenDashboard
        name={displayName}
        organizationName={organization?.name ?? null}
        outletName={assignment?.outlet.name ?? null}
      />
    )
  }

  const [totalOrganizations, activeOutlets] = await Promise.all([
    prisma.organization.count(),
    prisma.outlet.count(),
  ])

  return (
    <AdminDashboard
      name={displayName}
      stats={{
        totalOrganizations,
        activeOutlets,
        forecastInferencesToday: 0,
      }}
    />
  )
}
