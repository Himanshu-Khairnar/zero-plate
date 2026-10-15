"use client"

import { Minus, Plus } from "lucide-react"

import type { KitchenDishRow } from "@/actions/kitchen"
import { cn } from "@/lib/utils"

function StepButton({
  label,
  disabled,
  onClick,
  children,
  className,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-12 min-w-12 items-center justify-center rounded-xl border-2 border-input bg-background text-xl font-bold transition-colors hover:bg-muted active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  )
}

function StepControl({
  label,
  value,
  disabled,
  onAdjust,
  showPlusFive = false,
}: {
  label: string
  value: number
  disabled: boolean
  onAdjust: (delta: number) => void
  showPlusFive?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <StepButton
          label={`Decrease ${label}`}
          disabled={disabled}
          onClick={() => onAdjust(-1)}
        >
          <Minus className="size-6" aria-hidden="true" />
        </StepButton>
        <span className="w-14 text-center text-2xl font-bold tabular-nums">
          {value}
        </span>
        <StepButton
          label={`Increase ${label}`}
          disabled={disabled}
          onClick={() => onAdjust(1)}
        >
          <Plus className="size-6" aria-hidden="true" />
        </StepButton>
        {showPlusFive ? (
          <StepButton
            label={`Increase ${label} by 5`}
            disabled={disabled}
            onClick={() => onAdjust(5)}
            className="w-auto px-3 text-base"
          >
            +5
          </StepButton>
        ) : null}
      </div>
    </div>
  )
}

export function DishCard({
  dish,
  disabled,
  onAdjust,
}: {
  dish: KitchenDishRow
  disabled: boolean
  onAdjust: (field: "prepared" | "sold", delta: number) => void
}) {
  const leftover = dish.prepared - dish.sold

  return (
    <div className="rounded-2xl border-2 bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-sm border",
              dish.isVeg
                ? "border-emerald-600 bg-emerald-600/10"
                : "border-red-600 bg-red-600/10",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                dish.isVeg ? "bg-emerald-600" : "bg-red-600",
              )}
            />
          </span>
          <h3 className="text-lg font-semibold tracking-tight">
            {dish.name}
          </h3>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
            dish.isVeg
              ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
          )}
        >
          {dish.isVeg ? "Veg" : "Non-veg"}
        </span>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Planned prep target:{" "}
        <span className="font-semibold text-foreground">
          {dish.prepTarget}
        </span>
      </p>

      <div className="mt-4 space-y-3 border-t pt-4">
        <StepControl
          label="Prepared"
          value={dish.prepared}
          disabled={disabled}
          showPlusFive
          onAdjust={(delta) => onAdjust("prepared", delta)}
        />
        <StepControl
          label="Sold"
          value={dish.sold}
          disabled={disabled}
          onAdjust={(delta) => onAdjust("sold", delta)}
        />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-muted px-4 py-3">
        <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Leftover
        </span>
        <span
          className={cn(
            "text-2xl font-bold tabular-nums",
            leftover > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-foreground",
          )}
        >
          {leftover}
        </span>
      </div>
    </div>
  )
}
