"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"
import { Leaf, LogOut, Menu, X } from "lucide-react"
import type { Role } from "@prisma/client"

import { logout } from "@/actions/auth"
import { cn } from "@/lib/utils"
import { getNavGroupsForRole } from "@/components/dashboard/nav"
import { RoleBadge } from "@/components/dashboard/role-badge"
import { AlertBell } from "@/components/alerts/alert-bell"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type DashboardUser = {
  name: string
  role: Role
  organizationName: string | null
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "U"
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function BrandMark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Leaf className="size-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-semibold tracking-tight">Zero Plate</span>
        <span className="text-xs text-muted-foreground">Zero-waste ops</span>
      </span>
    </Link>
  )
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname()
  const groups = getNavGroupsForRole(role)

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {group.title}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon
            const active =
              item.href === "/dashboard" || item.href === "/kitchen"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4.5 shrink-0 transition-colors",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function UserChip({ user }: { user: DashboardUser }) {
  return (
    <div className="flex items-center gap-3 border-t p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {getInitials(user.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.organizationName ?? "Zero Plate"}</p>
      </div>
    </div>
  )
}

export function DashboardShell({ user, alertCount = 0, children }: { user: DashboardUser; alertCount?: number; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="no-print sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-4">
          <BrandMark />
        </div>
        <Separator />
        <NavLinks role={user.role} />
        <UserChip user={user} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r bg-sidebar">
            <div className="flex h-16 items-center justify-between px-4">
              <BrandMark />
              <Button variant="ghost" size="icon-sm" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <X />
              </Button>
            </div>
            <Separator />
            <NavLinks role={user.role} onNavigate={() => setMobileOpen(false)} />
            <UserChip user={user} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon-sm" aria-label="Open menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.organizationName ?? "Zero Plate"}</p>
            <p className="truncate text-xs text-muted-foreground">Signed in as {user.name}</p>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <AlertBell count={alertCount} />
            <RoleBadge role={user.role} className="hidden sm:inline-flex" />
            <form action={logout}>
              <Tooltip>
                <TooltipTrigger render={<Button type="submit" variant="outline" size="sm" />}>
                  <LogOut data-icon="inline-start" aria-hidden="true" />
                  <span className="hidden sm:inline">Sign out</span>
                </TooltipTrigger>
                <TooltipContent>Sign out of Zero Plate</TooltipContent>
              </Tooltip>
            </form>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
