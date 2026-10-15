import Link from "next/link"
import {
  ArrowRight,
  Camera,
  ChefHat,
  ListChecks,
  Play,
  Receipt,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const ACTIONS: {
  label: string
  description: string
  href: string
  icon: LucideIcon
}[] = [
  {
    label: "Quick Start Shift",
    description: "Clock in and open the kitchen board",
    href: "/kitchen",
    icon: Play,
  },
  {
    label: "Enter Sales",
    description: "Log today's covers and revenue",
    href: "/kitchen/sales",
    icon: Receipt,
  },
  {
    label: "Log Waste Photo",
    description: "Snap and tag wasted ingredients",
    href: "/kitchen/waste",
    icon: Camera,
  },
  {
    label: "Complete Day Checklist",
    description: "Close out prep and cleaning tasks",
    href: "/kitchen/closing",
    icon: ListChecks,
  },
]

export function KitchenDashboard({
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
      <section className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-6">
        <p className="text-sm text-muted-foreground">
          {organizationName ?? "Your organization"} ·{" "}
          {outletName ?? "Your outlet"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Let&apos;s get cooking, {name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap an action below to get started.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-28 flex-col justify-between rounded-2xl border bg-background p-5 shadow-sm transition-colors hover:border-ring hover:bg-muted/50"
            >
              <Icon className="size-8 text-primary" aria-hidden="true" />
              <div className="mt-4">
                <p className="text-lg font-semibold tracking-tight">
                  {action.label}
                </p>
                <p className="text-sm text-muted-foreground">
                  {action.description}
                </p>
              </div>
            </Link>
          )
        })}
      </section>

      <Link
        href="/kitchen"
        className="flex items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 transition-colors hover:bg-primary/10"
      >
        <div className="flex items-center gap-3">
          <ChefHat className="size-6 text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold">Open full Kitchen Mode</p>
            <p className="text-sm text-muted-foreground">
              Shift logging, prep sheets, and the live board
            </p>
          </div>
        </div>
        <ArrowRight className="size-5 text-primary" aria-hidden="true" />
      </Link>
    </div>
  )
}
