"use client"

import { useActionState } from "react"

import { acceptInvite } from "@/actions/invite-staff"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"

const inputClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50"

export function AcceptInviteForm({
  token,
  email,
}: {
  token: string
  email: string
}) {
  const [state, formAction, pending] = useActionState(acceptInvite, undefined)

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Accept your invitation
          </h1>
          <p className="text-sm text-muted-foreground">
            Setting up an account for{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        {state?.error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Jane Doe"
              aria-invalid={state?.fieldErrors?.name ? true : undefined}
              className={inputClassName}
            />
            {state?.fieldErrors?.name ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              aria-invalid={state?.fieldErrors?.password ? true : undefined}
              className={inputClassName}
            />
            {state?.fieldErrors?.password ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.password}
              </p>
            ) : null}
          </div>

          <Button type="submit" disabled={pending} size="lg" className="w-full">
            {pending ? "Creating account…" : "Create account & sign in"}
          </Button>
        </form>
      </div>
    </div>
  )
}
