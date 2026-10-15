import type { Role } from "@prisma/client"

import { cn } from "@/lib/utils"

const ROLE_META: Record<Role, { label: string; className: string }> = {
  OWNER: {
    label: "Owner",
    className: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  MANAGER: {
    label: "Manager",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  KITCHEN_STAFF: {
    label: "Kitchen Staff",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  PLATFORM_ADMIN: {
    label: "Platform Admin",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
}

export function RoleBadge({
  role,
  className,
}: {
  role: Role
  className?: string
}) {
  const meta = ROLE_META[role]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}
