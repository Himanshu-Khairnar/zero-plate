import Link from "next/link"
import { Bell, CircleDollarSign, Leaf, Recycle, TrendingDown } from "lucide-react"

import { KpiCard } from "@/components/dashboard/kpi-card"
import { InviteStaffDialog } from "@/components/dashboard/invite-staff-dialog"
import {
  OutletSelector,
  type OutletOption,
} from "@/components/dashboard/outlet-selector"
import { Badge } from "@/components/ui/badge"
import { inr, num, pct } from "@/lib/format"

export type OutletCard = OutletOption & {
  revenue30: number
  wastePct: number
  planStatus: string
  unreadAlerts: number
}

export type OwnerStats = {
  revenue30: number
  revenueChange7: number | null
  wastePct: number
  moneySaved: number
  co2AvoidedKg: number
  mealsDonated: number
  unreadAlerts: number
}

export function OwnerDashboard({
  name,
  organizationName,
  outlets,
  stats,
  cards,
}: {
  name: string
  organizationName: string | null
  outlets: OutletOption[]
  stats: OwnerStats
  cards: OutletCard[]
}) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-transparent to-chart-3/5 p-6">
        <p className="text-sm font-medium text-muted-foreground">
          {organizationName ?? "Your organization"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome back, {name}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Here is how your outlets performed over the last 30 days.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <OutletSelector outlets={outlets} />
          <InviteStaffDialog outlets={outlets} />
        </div>
      </section>

      {stats.unreadAlerts > 0 ? (
        <Link
          href="/alerts"
          className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-primary/80 transition-colors hover:bg-primary/15 dark:text-primary/80"
        >
          <Bell className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              {stats.unreadAlerts} unread alert{stats.unreadAlerts === 1 ? "" : "s"}
            </p>
            <p className="text-sm">Unusual sales days, low stock, expiring batches or plans waiting for approval.</p>
          </div>
        </Link>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue · 30 days"
          value={inr(stats.revenue30)}
          icon={CircleDollarSign}
          tone="emerald"
          trend={
            stats.revenueChange7 != null
              ? {
                  label: `${Math.abs(stats.revenueChange7)}% vs previous week`,
                  direction: stats.revenueChange7 >= 0 ? "up" : "down",
                  positive: stats.revenueChange7 >= 0,
                }
              : undefined
          }
        />
        <KpiCard
          label="Waste %"
          value={pct(stats.wastePct, 1)}
          icon={TrendingDown}
          tone={stats.wastePct > 5 ? "red" : "amber"}
          hint="plates wasted as a share of plates sold"
        />
        <KpiCard
          label="Cost saved · est."
          value={inr(stats.moneySaved)}
          icon={Recycle}
          tone="blue"
          hint="waste share now vs the first two weeks"
        />
        <KpiCard
          label="CO₂ avoided · est."
          value={`${num(stats.co2AvoidedKg, 1)} kg`}
          icon={Leaf}
          tone="violet"
          hint={`${num(stats.mealsDonated)} meals donated this month`}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">All outlets</h2>
          <span className="text-sm text-muted-foreground">
            {outlets.length} total
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((outlet) => {
            const healthy = outlet.wastePct <= 5 && outlet.unreadAlerts === 0
            return (
              <Link
                key={outlet.id}
                href={`/analytics?outlet=${outlet.id}`}
                className="rounded-2xl border bg-background p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{outlet.name}</p>
                  <Badge variant={healthy ? "secondary" : "outline"} className={healthy ? "text-primary" : "text-primary/80"}>
                    <span className={`mr-1.5 size-1.5 rounded-full ${healthy ? "bg-primary" : "bg-primary/70"}`} />
                    {healthy ? "Healthy" : "Attention"}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">Revenue · 30d</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{inr(outlet.revenue30)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">Waste %</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{pct(outlet.wastePct, 1)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">Tomorrow&apos;s plan</dt>
                    <dd className="mt-0.5 font-semibold">{outlet.planStatus === "MISSING" ? "Not drafted" : outlet.planStatus.toLowerCase()}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">Unread alerts</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{outlet.unreadAlerts}</dd>
                  </div>
                </dl>
              </Link>
            )
          })}
          {outlets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No outlets have been created yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
