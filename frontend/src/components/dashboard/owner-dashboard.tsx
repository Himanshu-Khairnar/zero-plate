import { CircleDollarSign, Leaf, Recycle, TrendingDown } from "lucide-react"

import { KpiCard } from "@/components/dashboard/kpi-card"
import { InviteStaffDialog } from "@/components/dashboard/invite-staff-dialog"
import { OutletSelector, type OutletOption } from "@/components/dashboard/outlet-selector"

export function OwnerDashboard({
  name,
  organizationName,
  outlets,
}: {
  name: string
  organizationName: string | null
  outlets: OutletOption[]
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-6">
        <p className="text-sm text-muted-foreground">
          {organizationName ?? "Your organization"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Welcome back, {name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is how your outlets are performing today.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <OutletSelector outlets={outlets} />
          <InviteStaffDialog outlets={outlets} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value="₹4,82,500"
          hint="+8.2% vs last week"
          icon={CircleDollarSign}
        />
        <KpiCard
          label="Waste %"
          value="3.4%"
          hint="-0.6% vs last week"
          icon={TrendingDown}
        />
        <KpiCard
          label="Cost Saved"
          value="₹62,300"
          hint="Food cost recovered this month"
          icon={Recycle}
        />
        <KpiCard
          label="CO₂ Avoided"
          value="1.2 t"
          hint="Equivalent emissions this month"
          icon={Leaf}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          All outlets
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {outlets.map((outlet) => (
            <div
              key={outlet.id}
              className="rounded-xl border bg-background p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{outlet.name}</p>
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Healthy
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Revenue</dt>
                  <dd className="font-medium">₹2,41,250</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Waste %</dt>
                  <dd className="font-medium">3.1%</dd>
                </div>
              </dl>
            </div>
          ))}
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
