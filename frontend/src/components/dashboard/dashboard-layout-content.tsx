import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"

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

  return (
    <DashboardShell
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
