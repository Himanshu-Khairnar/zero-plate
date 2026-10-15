"use client"

import { Lock } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ClosingChecklistModal({
  open,
  totals,
  locked,
  verified,
  locking,
  error,
  onVerifiedChange,
  onClose,
  onLock,
}: {
  open: boolean
  totals: { prepared: number; sold: number; leftover: number }
  locked: boolean
  verified: boolean
  locking: boolean
  error: string | null
  onVerifiedChange: (value: boolean) => void
  onClose: () => void
  onLock: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close checklist"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl border bg-background p-6 shadow-xl">
        <h2 className="text-xl font-semibold tracking-tight">
          End of Day Closing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review today&apos;s numbers across both shifts before locking.
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted p-3 text-center">
            <dt className="text-xs font-medium text-muted-foreground uppercase">
              Prepared
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {totals.prepared}
            </dd>
          </div>
          <div className="rounded-xl bg-muted p-3 text-center">
            <dt className="text-xs font-medium text-muted-foreground uppercase">
              Sold
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {totals.sold}
            </dd>
          </div>
          <div className="rounded-xl bg-muted p-3 text-center">
            <dt className="text-xs font-medium text-muted-foreground uppercase">
              Leftover
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {totals.leftover}
            </dd>
          </div>
        </dl>

        <label className="mt-5 flex items-center gap-3 rounded-xl border p-4">
          <input
            type="checkbox"
            checked={verified}
            onChange={(event) => onVerifiedChange(event.target.checked)}
            className="size-6 shrink-0 rounded border-input accent-primary"
          />
          <span className="text-base font-medium">
            All shift numbers verified
          </span>
        </label>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={locking}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onLock}
            disabled={!verified || locked || locking}
          >
            <Lock className="size-4" aria-hidden="true" />
            {locking ? "Locking…" : "Lock & Complete Day"}
          </Button>
        </div>
      </div>
    </div>
  )
}
