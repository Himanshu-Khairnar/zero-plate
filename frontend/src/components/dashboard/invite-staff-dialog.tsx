"use client"

import { useActionState, useState } from "react"
import { UserPlus } from "lucide-react"

import { inviteStaff } from "@/actions/invite-staff"
import { Button } from "@/components/ui/button"
import type { OutletOption } from "@/components/dashboard/outlet-selector"

const inputClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50"

export function InviteStaffDialog({ outlets }: { outlets: OutletOption[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(inviteStaff, undefined)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" aria-hidden="true" />
        Invite staff
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border bg-background p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Invite staff
                </h2>
                <p className="text-sm text-muted-foreground">
                  Send an invitation link valid for 48 hours.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {state?.error ? (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </p>
            ) : null}

            {state?.inviteUrl ? (
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                <p className="font-medium">Invitation created</p>
                <p className="mt-1 break-all text-xs">{state.inviteUrl}</p>
              </div>
            ) : null}

            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="invite-email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  placeholder="staff@example.com"
                  aria-invalid={state?.fieldErrors?.email ? true : undefined}
                  className={inputClassName}
                />
                {state?.fieldErrors?.email ? (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="invite-role" className="text-sm font-medium">
                    Role
                  </label>
                  <select
                    id="invite-role"
                    name="role"
                    defaultValue="KITCHEN_STAFF"
                    className={inputClassName}
                  >
                    <option value="KITCHEN_STAFF">Kitchen Staff</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="invite-outlet"
                    className="text-sm font-medium"
                  >
                    Outlet
                  </label>
                  <select
                    id="invite-outlet"
                    name="outletId"
                    required
                    defaultValue={outlets[0]?.id ?? ""}
                    className={inputClassName}
                  >
                    {outlets.length === 0 ? (
                      <option value="">No outlets</option>
                    ) : (
                      outlets.map((outlet) => (
                        <option key={outlet.id} value={outlet.id}>
                          {outlet.name}
                        </option>
                      ))
                    )}
                  </select>
                  {state?.fieldErrors?.outletId ? (
                    <p className="text-sm text-destructive">
                      {state.fieldErrors.outletId}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Sending…" : "Send invitation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
