import {
  Activity,
  Building,
  Camera,
  ChartColumn,
  ChefHat,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Package,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Role } from "@prisma/client"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  OWNER: [
    { label: "All Outlets Overview", href: "/dashboard", icon: LayoutDashboard },
    { label: "Forecasts", href: "/forecasts", icon: TrendingUp },
    { label: "Analytics", href: "/analytics", icon: ChartColumn },
    { label: "Waste Heatmap", href: "/waste-heatmap", icon: MapPinned },
    { label: "Staff Management", href: "/staff", icon: Users },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  MANAGER: [
    { label: "My Outlet Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Menu & Recipes", href: "/menu", icon: Utensils },
    { label: "Daily Prep Plan", href: "/prep-plan", icon: ClipboardList },
    { label: "Inventory & Orders", href: "/inventory", icon: Package },
    { label: "Waste Log", href: "/waste-log", icon: Receipt },
  ],
  KITCHEN_STAFF: [
    { label: "Kitchen Mode (Shift Logging)", href: "/kitchen", icon: ChefHat },
    {
      label: "Today's Prep Sheet",
      href: "/kitchen/prep",
      icon: ClipboardList,
    },
    { label: "Photo Waste Capture", href: "/kitchen/waste", icon: Camera },
    { label: "Closing Checklist", href: "/kitchen/closing", icon: ListChecks },
  ],
  PLATFORM_ADMIN: [
    { label: "System Overview", href: "/dashboard", icon: LayoutDashboard },
    { label: "All Tenants", href: "/admin/tenants", icon: Building },
    { label: "Model Accuracy Drift", href: "/admin/model-drift", icon: Activity },
    { label: "Global Audit Logs", href: "/admin/audit-logs", icon: FileText },
  ],
}

export function getNavForRole(role: Role): NavItem[] {
  return NAV_BY_ROLE[role] ?? []
}
