import { Suspense } from "react"
import type { ReactNode } from "react"

import { DashboardLayoutContent } from "@/components/dashboard/dashboard-layout-content"
import { DashboardLoading } from "@/components/dashboard/dashboard-loading"

export default function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  )
}
