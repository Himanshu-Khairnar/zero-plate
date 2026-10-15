"use client"

import { useMemo, useState, useTransition } from "react"
import { CalendarDays, Lock, Moon, Sun } from "lucide-react"

import {
  closeAndLockDay,
  saveKitchenShiftLog,
  type KitchenDishRow,
} from "@/actions/kitchen"
import { DishCard } from "@/components/dashboard/kitchen/dish-card"
import { ClosingChecklistModal } from "@/components/dashboard/kitchen/closing-checklist-modal"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Shift = "LUNCH" | "DINNER"

const SHIFTS: { value: Shift; label: string; icon: typeof Sun }[] = [
  { value: "LUNCH", label: "Lunch", icon: Sun },
  { value: "DINNER", label: "Dinner", icon: Moon },
]

export function KitchenMode({
  outletId,
  outletName,
  dateIso,
  dateLabel,
  initialLocked,
  initialData,
}: {
  outletId: string
  outletName: string
  dateIso: string
  dateLabel: string
  initialLocked: boolean
  initialData: Record<Shift, KitchenDishRow[]>
}) {
  const [shift, setShift] = useState<Shift>("LUNCH")
  const [data, setData] = useState<Record<Shift, KitchenDishRow[]>>(initialData)
  const [locked, setLocked] = useState(initialLocked)
  const [modalOpen, setModalOpen] = useState(false)
  const [verified, setVerified] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const totals = useMemo(() => {
    const all = [...data.LUNCH, ...data.DINNER]
    const prepared = all.reduce((sum, row) => sum + row.prepared, 0)
    const sold = all.reduce((sum, row) => sum + row.sold, 0)
    return { prepared, sold, leftover: prepared - sold }
  }, [data])

  function handleAdjust(
    dishId: string,
    field: "prepared" | "sold",
    delta: number,
  ) {
    if (locked) {
      return
    }

    const current = data[shift].find((row) => row.dishId === dishId)
    if (!current) {
      return
    }

    const nextRow = {
      ...current,
      [field]: Math.max(0, current[field] + delta),
    }

    setData((prev) => ({
      ...prev,
      [shift]: prev[shift].map((row) =>
        row.dishId === dishId ? nextRow : row,
      ),
    }))

    startTransition(async () => {
      const result = await saveKitchenShiftLog({
        dishId,
        outletId,
        date: dateIso,
        shift,
        prepared: nextRow.prepared,
        sold: nextRow.sold,
      })
      if (!result.ok) {
        setError(result.error)
      }
    })
  }

  async function handleLock() {
    setError(null)
    setLocking(true)
    const result = await closeAndLockDay(outletId, dateIso)
    setLocking(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setLocked(true)
    setModalOpen(false)
    setVerified(false)
  }

  const rows = data[shift]

  return (
    <div className="space-y-6 pb-28">
      <header className="rounded-2xl border-2 bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{outletName}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden="true" />
              {dateLabel}
            </p>
          </div>
          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <Lock className="size-4" aria-hidden="true" />
              Day Locked
            </span>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Shift"
          className="mt-4 inline-flex rounded-xl border-2 p-1"
        >
          {SHIFTS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={shift === value}
              onClick={() => setShift(value)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-lg px-5 text-base font-semibold transition-colors",
                shift === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed p-8 text-center text-muted-foreground">
          No dishes have been configured for this outlet yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((dish) => (
            <DishCard
              key={dish.dishId}
              dish={dish}
              disabled={locked}
              onAdjust={(field, delta) =>
                handleAdjust(dish.dishId, field, delta)
              }
            />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {locked
              ? "This day is locked. No further changes can be made."
              : `${totals.prepared} prepared · ${totals.sold} sold · ${totals.leftover} leftover`}
          </p>
          <Button
            type="button"
            size="lg"
            disabled={locked}
            onClick={() => {
              setError(null)
              setModalOpen(true)
            }}
          >
            <Lock className="size-4" aria-hidden="true" />
            End of Day Closing
          </Button>
        </div>
      </div>

      <ClosingChecklistModal
        open={modalOpen}
        totals={totals}
        locked={locked}
        verified={verified}
        locking={locking}
        error={error}
        onVerifiedChange={setVerified}
        onClose={() => setModalOpen(false)}
        onLock={handleLock}
      />
    </div>
  )
}
