import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { unreadAlertCount } from "@/lib/alerts"
import { listOutlets } from "@/lib/outlets"

export async function DashboardLayoutContent({
  children,
}: {
  children: ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  const organization = session.user.organizationId
    ? await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { name: true },
      })
    : null

  const viewer = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "User",
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  }
  const outlets = await listOutlets(viewer)
  const counts = await Promise.all(outlets.map((o) => unreadAlertCount(o.id)))
  const alertCount = counts.reduce((s, n) => s + n, 0)

  return (
    <DashboardShell
      alertCount={alertCount}
      user={{
        name: session.user.name ?? session.user.email ?? "User",
        role: session.user.role,
        organizationName: organization?.name ?? null,
      }}
    >
      {children}
    </DashboardShell>
  )
}
