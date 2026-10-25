import "server-only"

import { prisma } from "@/lib/prisma"
import { parseIsoDate } from "@/lib/date"

/**
 * Module G core DB logic, shared by the kitchen server actions (session auth)
 * and the mobile API (bearer auth). Callers check access first.
 */

export type KitchenLogInput = {
  dishId: string
  outletId: string
  date: string // YYYY-MM-DD
  shift: "LUNCH" | "DINNER"
  prepared: number
  sold: number
}

export type KitchenLogResult = { ok: true } | { ok: false; error: string }

/** Create or update one dish/shift count unless the day is locked. */
export async function upsertKitchenLog(input: KitchenLogInput): Promise<KitchenLogResult> {
  const { dishId, outletId, date, shift, prepared, sold } = input
  const day = parseIsoDate(date)
  const key = { dishId_outletId_date_shift: { dishId, outletId, date: day, shift } }

  const existing = await prisma.kitchenLog.findUnique({ where: key, select: { isLocked: true } })
  if (existing?.isLocked) {
    return { ok: false, error: "This day has been locked." }
  }

  await prisma.kitchenLog.upsert({
    where: key,
    update: { prepared, sold },
    create: { dishId, outletId, date: day, shift, prepared, sold },
  })
  return { ok: true }
}

/** Active dishes the outlet cooks: its own plus organisation-wide ones (same rule as kitchen mode). */
export function kitchenDishWhere(organizationId: string, outletId: string) {
  return { organizationId, isActive: true, OR: [{ outletId }, { outletId: null }] }
}

export type KitchenDaySummary = {
  date: string
  locked: boolean
  dishes: {
    dishId: string
    dishName: string
    target: number
    prepared: number
    sold: number
    leftover: number
    shifts: Record<"LUNCH" | "DINNER", { prepared: number; sold: number }>
  }[]
}

/**
 * Per-dish totals for a day, summed over shifts. The target is the approved
 * prep plan's quantity for that day when there is one, else Dish.prepTarget.
 */
export async function kitchenDaySummary(outletId: string, date: string): Promise<KitchenDaySummary> {
  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { organizationId: true } })
  const day = parseIsoDate(date)
  const [dishes, plan] = await Promise.all([
    prisma.dish.findMany({
      where: kitchenDishWhere(outlet.organizationId, outletId),
      orderBy: [{ name: "asc" }],
      include: { logs: { where: { outletId, date: day } } },
    }),
    prisma.prepPlan.findUnique({
      where: { outletId_date: { outletId, date } },
      select: { status: true, items: { select: { dishId: true, plannedQty: true } } },
    }),
  ])
  const planned = new Map(plan && plan.status !== "DRAFT" ? plan.items.map((i) => [i.dishId, i.plannedQty]) : [])

  return {
    date,
    locked: dishes.some((d) => d.logs.some((l) => l.isLocked)),
    dishes: dishes.map((d) => {
      const prepared = d.logs.reduce((s, l) => s + l.prepared, 0)
      const sold = d.logs.reduce((s, l) => s + l.sold, 0)
      const shift = (name: "LUNCH" | "DINNER") => {
        const log = d.logs.find((l) => l.shift === name)
        return { prepared: log?.prepared ?? 0, sold: log?.sold ?? 0 }
      }
      return {
        dishId: d.id,
        dishName: d.name,
        target: planned.get(d.id) ?? d.prepTarget,
        prepared,
        sold,
        leftover: Math.max(0, prepared - sold),
        shifts: { LUNCH: shift("LUNCH"), DINNER: shift("DINNER") },
      }
    }),
  }
}
