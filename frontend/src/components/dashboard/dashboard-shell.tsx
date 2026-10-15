"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"
import { LogOut, Menu, Utensils, X } from "lucide-react"
import type { Role } from "@prisma/client"

import { logout } from "@/actions/auth"
import { cn } from "@/lib/utils"
import { getNavForRole } from "@/components/dashboard/nav"
import { RoleBadge } from "@/components/dashboard/role-badge"

export type DashboardUser = {
  name: string
  role: Role
  organizationName: string | null
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return "U"
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
        <Utensils className="size-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-semibold tracking-tight">WasteLess</span>
        <span className="text-xs text-muted-foreground">Zero-waste ops</span>
      </span>
    </div>
  )
}

function NavLinks({
  role,
  onNavigate,
}: {
  role: Role
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const items = getNavForRole(role)

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Menu
      </p>
      {items.map((item) => {
        const Icon = item.icon
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-5 shrink-0 transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserChip({ user }: { user: DashboardUser }) {
  return (
    <div className="flex items-center gap-3 border-t p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
        {getInitials(user.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.organizationName ?? "WasteLess"}
        </p>
      </div>
    </div>
  )
}

export function DashboardShell({
  user,
  children,
}: {
  user: DashboardUser
  children: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <BrandMark />
        </div>
        <NavLinks role={user.role} />
        <UserChip user={user} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-background">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <BrandMark />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks role={user.role} onNavigate={() => setMobileOpen(false)} />
            <UserChip user={user} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {user.organizationName ?? "WasteLess"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Signed in as {user.name}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <RoleBadge role={user.role} className="hidden sm:inline-flex" />
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
