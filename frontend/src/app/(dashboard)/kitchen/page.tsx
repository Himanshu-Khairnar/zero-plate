import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { formatDisplayDate, todayIsoDate } from "@/lib/date"
import { getTodayKitchenData } from "@/actions/kitchen"
import { KitchenMode } from "@/components/dashboard/kitchen/kitchen-mode"

export default async function KitchenPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  const { id, role, organizationId } = session.user

  let outlet: { id: string; name: string } | null = null

  if (role === "KITCHEN_STAFF" || role === "MANAGER") {
    const assignment = await prisma.userOutlet.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "asc" },
      select: { outlet: { select: { id: true, name: true } } },
    })
    outlet = assignment?.outlet ?? null
  }

  if (!outlet && organizationId) {
    outlet = await prisma.outlet.findFirst({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    })
  }

  if (!outlet) {
    return (
      <div className="rounded-2xl border-2 border-dashed p-8 text-center text-muted-foreground">
        No outlet is assigned to your account yet.
      </div>
    )
  }

  const dateIso = todayIsoDate()
  const [lunch, dinner] = await Promise.all([
    getTodayKitchenData(outlet.id, "LUNCH"),
    getTodayKitchenData(outlet.id, "DINNER"),
  ])

  return (
    <KitchenMode
      outletId={outlet.id}
      outletName={outlet.name}
      dateIso={dateIso}
      dateLabel={formatDisplayDate(dateIso)}
      initialLocked={lunch.isLocked || dinner.isLocked}
      initialData={{ LUNCH: lunch.rows, DINNER: dinner.rows }}
    />
  )
}
