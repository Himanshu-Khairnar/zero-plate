import { NextResponse } from "next/server"
import type { Role } from "@prisma/client"

import { auth } from "@/auth.edge"

const PUBLIC_ROUTES = ["/login", "/register", "/accept-invite"]
const PROTECTED_PREFIXES = [
  "/dashboard", "/kitchen", "/admin", "/settings", "/forecasts", "/prep-plan", "/whatif",
  "/models", "/menu", "/sales", "/inventory", "/waste-log", "/donations", "/analytics",
  "/waste-heatmap", "/reports", "/assistant", "/staff", "/data", "/alerts",
]

const ROLE_HOME: Record<Role, string> = {
  OWNER: "/dashboard",
  MANAGER: "/dashboard",
  PLATFORM_ADMIN: "/dashboard",
  KITCHEN_STAFF: "/kitchen",
}

function homeForRole(role: Role | undefined) {
  return role ? ROLE_HOME[role] : "/dashboard"
}

function isUnder(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export default auth((req) => {
  const { nextUrl } = req
  const { pathname } = nextUrl
  const isLoggedIn = Boolean(req.auth)
  const role = req.auth?.user?.role
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    isUnder(pathname, prefix),
  )

  if (!isLoggedIn) {
    if (isProtectedRoute) {
      const loginUrl = new URL("/login", nextUrl)
      loginUrl.searchParams.set(
        "callbackUrl",
        `${nextUrl.pathname}${nextUrl.search}`,
      )
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  if (isPublicRoute) {
    return NextResponse.redirect(new URL(homeForRole(role), nextUrl))
  }

  if (isUnder(pathname, "/admin") && role !== "PLATFORM_ADMIN") {
    return NextResponse.redirect(new URL(homeForRole(role), nextUrl))
  }

  if (isUnder(pathname, "/settings") && role !== "OWNER") {
    return NextResponse.redirect(new URL(homeForRole(role), nextUrl))
  }

  const canAccessKitchen =
    role === "KITCHEN_STAFF" || role === "MANAGER" || role === "OWNER"

  if (isUnder(pathname, "/kitchen") && !canAccessKitchen) {
    return NextResponse.redirect(new URL(homeForRole(role), nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
