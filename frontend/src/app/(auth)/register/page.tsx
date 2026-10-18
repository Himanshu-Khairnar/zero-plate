"use client"

import Link from "next/link"
import { useActionState } from "react"

import { registerOrganization } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"

const inputClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50"

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null
  }
  return <p className="text-sm text-destructive">{message}</p>
}

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(
    registerOrganization,
    undefined,
  )

  const fieldErrors = state?.fieldErrors

  return (
    <div className="w-full max-w-lg">
      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your restaurant
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up your organization and first outlet to get started
          </p>
        </div>

        {state?.success ? (
          <div
            role="status"
            className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            Account created. You can now{" "}
            <Link href="/login" className="font-medium underline">
              sign in
            </Link>
            .
          </div>
        ) : null}

        {state?.error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="organizationName" className="text-sm font-medium">
              Restaurant / Organization name
            </label>
            <input
              id="organizationName"
              name="organizationName"
              type="text"
              required
              placeholder="Zero Plate Kitchen"
              aria-invalid={fieldErrors?.organizationName ? true : undefined}
              className={inputClassName}
            />
            <FieldError message={fieldErrors?.organizationName} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="outletName" className="text-sm font-medium">
                Outlet name
              </label>
              <input
                id="outletName"
                name="outletName"
                type="text"
                required
                placeholder="Main Branch"
                aria-invalid={fieldErrors?.outletName ? true : undefined}
                className={inputClassName}
              />
              <FieldError message={fieldErrors?.outletName} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="city" className="text-sm font-medium">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                required
                placeholder="Mumbai"
                aria-invalid={fieldErrors?.city ? true : undefined}
                className={inputClassName}
              />
              <FieldError message={fieldErrors?.city} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">
              Owner full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Jane Doe"
              aria-invalid={fieldErrors?.name ? true : undefined}
              className={inputClassName}
            />
            <FieldError message={fieldErrors?.name} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="owner@example.com"
              aria-invalid={fieldErrors?.email ? true : undefined}
              className={inputClassName}
            />
            <FieldError message={fieldErrors?.email} />
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
              aria-invalid={fieldErrors?.password ? true : undefined}
              className={inputClassName}
            />
            <FieldError message={fieldErrors?.password} />
          </div>

          <Button type="submit" disabled={pending} size="lg" className="w-full">
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
