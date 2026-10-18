import {
  Activity,
  Bell,
  FileSpreadsheet,
  BrainCircuit,
  Building,
  Camera,
  ChartColumn,
  ChefHat,
  ClipboardList,
  FileText,
  FlaskConical,
  HeartHandshake,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  MessageSquareText,
  Package,
  Receipt,
  Settings,
  TrendingUp,
  Upload,
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

export type NavGroup = {
  title: string
  items: NavItem[]
}

const PLANNING: NavItem[] = [
  { label: "Forecasts", href: "/forecasts", icon: TrendingUp },
  { label: "Daily Prep Plan", href: "/prep-plan", icon: ClipboardList },
  { label: "What-if Simulator", href: "/whatif", icon: FlaskConical },
]

const OPERATIONS: NavItem[] = [
  { label: "Menu & Recipes", href: "/menu", icon: Utensils },
  { label: "Sales Import", href: "/sales", icon: Upload },
  { label: "Data Sheets", href: "/data", icon: FileSpreadsheet },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Inventory & Orders", href: "/inventory", icon: Package },
  { label: "Waste Log", href: "/waste-log", icon: Receipt },
  { label: "Surplus & Donations", href: "/donations", icon: HeartHandshake },
]

const INSIGHTS: NavItem[] = [
  { label: "Analytics", href: "/analytics", icon: ChartColumn },
  { label: "Waste Heatmap", href: "/waste-heatmap", icon: MapPinned },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "AI Assistant", href: "/assistant", icon: MessageSquareText },
  { label: "Models", href: "/models", icon: BrainCircuit },
]

const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  OWNER: [
    { title: "Overview", items: [{ label: "All Outlets Overview", href: "/dashboard", icon: LayoutDashboard }] },
    { title: "Planning", items: PLANNING },
    { title: "Operations", items: OPERATIONS },
    { title: "Insights", items: INSIGHTS },
    {
      title: "Organisation",
      items: [
        { label: "Staff Management", href: "/staff", icon: Users },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],
  MANAGER: [
    { title: "Overview", items: [{ label: "My Outlet Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
    { title: "Planning", items: PLANNING },
    { title: "Operations", items: [...OPERATIONS, { label: "Kitchen Mode", href: "/kitchen", icon: ChefHat }] },
    { title: "Insights", items: INSIGHTS.filter((i) => i.href !== "/models") },
  ],
  KITCHEN_STAFF: [
    {
      title: "Kitchen",
      items: [
        { label: "Kitchen Mode (Shift Logging)", href: "/kitchen", icon: ChefHat },
        { label: "Today's Prep Sheet", href: "/kitchen/prep", icon: ClipboardList },
        { label: "Photo Waste Capture", href: "/kitchen/waste", icon: Camera },
        { label: "Closing Checklist", href: "/kitchen/closing", icon: ListChecks },
      ],
    },
  ],
  PLATFORM_ADMIN: [
    {
      title: "Platform",
      items: [
        { label: "System Overview", href: "/dashboard", icon: LayoutDashboard },
        { label: "All Tenants", href: "/admin/tenants", icon: Building },
        { label: "Model Accuracy Drift", href: "/admin/model-drift", icon: Activity },
        { label: "Global Audit Logs", href: "/admin/audit-logs", icon: FileText },
      ],
    },
  ],
}

export function getNavGroupsForRole(role: Role): NavGroup[] {
  return NAV_BY_ROLE[role] ?? []
}

/** Flat list, kept for callers that predate groups. */
export function getNavForRole(role: Role): NavItem[] {
  return getNavGroupsForRole(role).flatMap((g) => g.items)
}
