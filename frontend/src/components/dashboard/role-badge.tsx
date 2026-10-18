import type { Role } from "@prisma/client"

import { cn } from "@/lib/utils"

const ROLE_META: Record<Role, { label: string; className: string }> = {
  OWNER: {
    label: "Owner",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  MANAGER: {
    label: "Manager",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  KITCHEN_STAFF: {
    label: "Kitchen Staff",
    className: "border-primary/30 bg-primary/10 text-primary/80",
  },
  PLATFORM_ADMIN: {
    label: "Platform Admin",
    className: "border-primary/30 bg-primary/10 text-primary",
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
