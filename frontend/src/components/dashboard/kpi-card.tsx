import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"

export type KpiTone =
  | "default"
  | "emerald"
  | "amber"
  | "blue"
  | "violet"
  | "red"

const TONE_CLASSES: Record<KpiTone, string> = {
  default: "bg-muted text-muted-foreground",
  emerald: "bg-primary/10 text-primary",
  amber: "bg-primary/10 text-primary/80",
  blue: "bg-primary/10 text-primary",
  violet: "bg-primary/10 text-primary",
  red: "bg-foreground/10 text-foreground",
}

export type KpiTrend = {
  label: string
  direction: "up" | "down"
  positive: boolean
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  trend,
}: {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
  tone?: KpiTone
  trend?: KpiTrend
}) {
  return (
    <div className="rounded-2xl border bg-background p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        {Icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              TONE_CLASSES[tone],
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      {trend || hint ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                trend.positive
                  ? "bg-primary/10 text-primary"
                  : "bg-foreground/10 text-foreground",
              )}
            >
              {trend.direction === "up" ? (
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden="true" />
              )}
              {trend.label}
            </span>
          ) : null}
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
