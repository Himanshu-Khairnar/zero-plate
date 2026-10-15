import {
  Bell,
  CircleDollarSign,
  PackageSearch,
  TriangleAlert,
  TrendingDown,
} from "lucide-react"

import { KpiCard } from "@/components/dashboard/kpi-card"

const STOCK_ALERTS = [
  { item: "Paneer", detail: "2.1 kg left — below reorder point", level: "high" },
  { item: "Basmati Rice", detail: "8 kg left — reorder soon", level: "medium" },
  { item: "Tomatoes", detail: "5 kg left — reorder soon", level: "medium" },
]

export function ManagerDashboard({
  name,
  outletName,
  organizationName,
}: {
  name: string
  outletName: string | null
  organizationName: string | null
}) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-500/10 via-transparent to-emerald-500/5 p-6">
        <p className="text-sm font-medium text-muted-foreground">
          {organizationName ?? "Your organization"} ·{" "}
          {outletName ?? "Your outlet"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Good to see you, {name}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Today&apos;s operational summary for your outlet.
        </p>
      </section>

      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-300"
      >
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Prep Plan Awaiting Approval</p>
          <p className="text-sm">
            Tomorrow&apos;s prep plan has been generated and needs your review
            before service.
          </p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value="₹82,400"
          hint="62 orders so far"
          icon={CircleDollarSign}
          tone="emerald"
        />
        <KpiCard
          label="Waste Today"
          value="2.8%"
          hint="Target: under 4%"
          icon={TrendingDown}
          tone="amber"
        />
        <KpiCard
          label="Prep Tasks"
          value="12 / 18"
          hint="6 remaining for service"
          icon={Bell}
          tone="blue"
        />
        <KpiCard
          label="Low Stock Items"
          value="3"
          hint="Needs reordering"
          icon={PackageSearch}
          tone="red"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Quick stock alerts</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {STOCK_ALERTS.map((alert) => {
            const critical = alert.level === "high"
            return (
              <div
                key={alert.item}
                className="flex items-start justify-between gap-3 rounded-2xl border bg-background p-4 shadow-sm"
              >
                <div>
                  <p className="font-semibold">{alert.item}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {alert.detail}
                  </p>
                </div>
                <span
                  className={
                    critical
                      ? "inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-destructive"
                      : "inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-amber-700 dark:text-amber-300"
                  }
                >
                  {critical ? "Critical" : "Low"}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
