import { CircleDollarSign, Leaf, Recycle, TrendingDown } from "lucide-react"

import { KpiCard } from "@/components/dashboard/kpi-card"
import { InviteStaffDialog } from "@/components/dashboard/invite-staff-dialog"
import {
  OutletSelector,
  type OutletOption,
} from "@/components/dashboard/outlet-selector"

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
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/5 p-6">
        <p className="text-sm font-medium text-muted-foreground">
          {organizationName ?? "Your organization"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome back, {name}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Here is how your outlets are performing today.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <OutletSelector outlets={outlets} />
          <InviteStaffDialog outlets={outlets} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value="₹4,82,500"
          icon={CircleDollarSign}
          tone="emerald"
          trend={{ label: "8.2% vs last week", direction: "up", positive: true }}
        />
        <KpiCard
          label="Waste %"
          value="3.4%"
          icon={TrendingDown}
          tone="amber"
          trend={{
            label: "0.6% vs last week",
            direction: "down",
            positive: true,
          }}
        />
        <KpiCard
          label="Cost Saved"
          value="₹62,300"
          icon={Recycle}
          tone="blue"
          hint="Food cost recovered this month"
        />
        <KpiCard
          label="CO₂ Avoided"
          value="1.2 t"
          icon={Leaf}
          tone="violet"
          hint="Equivalent emissions this month"
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
          {outlets.map((outlet) => (
            <div
              key={outlet.id}
              className="rounded-2xl border bg-background p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{outlet.name}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Healthy
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/60 p-3">
                  <dt className="text-xs text-muted-foreground">Revenue</dt>
                  <dd className="mt-0.5 font-semibold">₹2,41,250</dd>
                </div>
                <div className="rounded-lg bg-muted/60 p-3">
                  <dt className="text-xs text-muted-foreground">Waste %</dt>
                  <dd className="mt-0.5 font-semibold">3.1%</dd>
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
