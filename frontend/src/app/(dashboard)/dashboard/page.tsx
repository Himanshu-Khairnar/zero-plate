import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { outletOverview } from "@/lib/analytics"
import { OwnerDashboard, type OutletCard } from "@/components/dashboard/owner-dashboard"
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard"
import { KitchenDashboard } from "@/components/dashboard/kitchen-dashboard"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"
import { today } from "@/lib/dates"
import { round } from "@/lib/prep"

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
    const overviews = await Promise.all(outlets.map((o) => outletOverview(o.id)))
    const cards: OutletCard[] = outlets.map((o, i) => ({
      ...o,
      revenue30: overviews[i].revenue30,
      wastePct: overviews[i].wastePct,
      planStatus: overviews[i].planStatus,
      unreadAlerts: overviews[i].unreadAlerts,
    }))
    const sum = (k: "revenue30" | "revenue7" | "plates30" | "co2AvoidedKg" | "unreadAlerts") => overviews.reduce((s, o) => s + (o[k] ?? 0), 0)
    const wastePlates = overviews.reduce((s, o) => s + o.waste.plates, 0)
    const plates30 = sum("plates30")
    const prev7 = overviews.reduce((s, o) => s + o.series.slice(-14, -7).reduce((a, p) => a + p.revenue, 0), 0)
    const rev7 = sum("revenue7")

    return (
      <OwnerDashboard
        name={displayName}
        organizationName={organization?.name ?? null}
        outlets={outlets}
        cards={cards}
        stats={{
          revenue30: sum("revenue30"),
          revenueChange7: prev7 ? round(((rev7 - prev7) / prev7) * 100, 1) : null,
          wastePct: plates30 ? round((wastePlates / plates30) * 100, 1) : 0,
          moneySaved: overviews.reduce((s, o) => s + o.savings.moneySaved, 0),
          co2AvoidedKg: round(sum("co2AvoidedKg"), 1),
          mealsDonated: overviews.reduce((s, o) => s + o.donated.month, 0),
          unreadAlerts: sum("unreadAlerts"),
        }}
      />
    )
  }

  if (role === "MANAGER") {
    const assignment = await prisma.userOutlet.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "asc" },
      include: { outlet: { select: { id: true, name: true } } },
    })
    const outlet =
      assignment?.outlet ??
      (organizationId
        ? await prisma.outlet.findFirst({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
        : null)
    const o = outlet ? await outletOverview(outlet.id) : null
    const alerts = outlet
      ? await prisma.alert.findMany({ where: { outletId: outlet.id, isRead: false }, orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take: 6 })
      : []

    return (
      <ManagerDashboard
        name={displayName}
        organizationName={organization?.name ?? null}
        outletName={outlet?.name ?? null}
        outletId={outlet?.id ?? null}
        stats={{
          revenue7: o?.revenue7 ?? 0,
          revenueChange7: o?.revenueChange7 ?? null,
          plates7: o ? o.series.slice(-7).reduce((s, p) => s + p.plates, 0) : 0,
          wastePct: o?.wastePct ?? 0,
          wasteCost30: o?.waste.cost ?? 0,
          planPending: o?.planPending ?? true,
          planStatus: o?.planStatus ?? "MISSING",
          forecastMape: o?.accuracy.mape ?? null,
          unreadAlerts: o?.unreadAlerts ?? 0,
          stockAlerts: alerts.filter((a) => a.type === "low_stock" || a.type === "expiry" || a.type === "shortage").length,
        }}
        alerts={alerts.map((a) => ({ id: a.id, type: a.type, severity: a.severity, message: a.message }))}
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

  const since = new Date(`${today()}T00:00:00.000Z`)
  const [totalOrganizations, activeOutlets, forecastInferencesToday] = await Promise.all([
    prisma.organization.count(),
    prisma.outlet.count(),
    prisma.forecast.count({ where: { createdAt: { gte: since } } }),
  ])

  return (
    <AdminDashboard
      name={displayName}
      stats={{
        totalOrganizations,
        activeOutlets,
        forecastInferencesToday,
      }}
    />
  )
}
