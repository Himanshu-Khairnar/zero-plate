"use server"

import { z } from "zod"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { parseIsoDate, todayUtcDate } from "@/lib/date"

export type KitchenShift = "LUNCH" | "DINNER"

export type KitchenDishRow = {
  dishId: string
  name: string
  isVeg: boolean
  prepTarget: number
  prepared: number
  sold: number
}

export type KitchenDayData = {
  isLocked: boolean
  rows: KitchenDishRow[]
}

export type KitchenActionResult = { ok: true } | { ok: false; error: string }

const KITCHEN_ROLES = ["OWNER", "MANAGER", "KITCHEN_STAFF"] as const

async function assertOutletAccess(outletId: string) {
  const session = await auth()
  if (!session?.user) {
    return { error: "You must be signed in." as const, organizationId: null }
  }

  if (
    !KITCHEN_ROLES.includes(
      session.user.role as (typeof KITCHEN_ROLES)[number],
    )
  ) {
    return { error: "You do not have access to kitchen operations." as const, organizationId: null }
  }

  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { organizationId: true },
  })

  if (!outlet) {
    return { error: "Outlet not found." as const, organizationId: null }
  }

  if (outlet.organizationId !== session.user.organizationId) {
    return { error: "You do not have access to this outlet." as const, organizationId: null }
  }

  return { error: null, organizationId: outlet.organizationId }
}

export async function getTodayKitchenData(
  outletId: string,
  shift: KitchenShift,
): Promise<KitchenDayData> {
  const access = await assertOutletAccess(outletId)
  if (access.error) {
    return { isLocked: false, rows: [] }
  }

  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { organizationId: true },
  })

  if (!outlet) {
    return { isLocked: false, rows: [] }
  }

  const date = todayUtcDate()

  const dishes = await prisma.dish.findMany({
    where: { organizationId: outlet.organizationId },
    orderBy: [{ name: "asc" }],
    include: {
      logs: {
        where: { outletId, date, shift },
        take: 1,
      },
    },
  })

  const rows: KitchenDishRow[] = dishes.map((dish) => {
    const log = dish.logs[0]
    return {
      dishId: dish.id,
      name: dish.name,
      isVeg: dish.isVeg,
      prepTarget: dish.prepTarget,
      prepared: log?.prepared ?? 0,
      sold: log?.sold ?? 0,
    }
  })

  const isLocked = dishes.some((dish) => dish.logs[0]?.isLocked)

  return { isLocked, rows }
}

const saveLogSchema = z.object({
  dishId: z.string().min(1),
  outletId: z.string().min(1),
  date: z.string().min(1),
  shift: z.enum(["LUNCH", "DINNER"]),
  prepared: z.number().int().min(0),
  sold: z.number().int().min(0),
})

export type SaveKitchenShiftLogInput = z.infer<typeof saveLogSchema>

export async function saveKitchenShiftLog(
  data: SaveKitchenShiftLogInput,
): Promise<KitchenActionResult> {
  const parsed = saveLogSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, error: "Invalid kitchen log input." }
  }

  const { dishId, outletId, date, shift, prepared, sold } = parsed.data

  const access = await assertOutletAccess(outletId)
  if (access.error) {
    return { ok: false, error: access.error }
  }

  const day = parseIsoDate(date)

  const existing = await prisma.kitchenLog.findUnique({
    where: {
      dishId_outletId_date_shift: { dishId, outletId, date: day, shift },
    },
    select: { isLocked: true },
  })

  if (existing?.isLocked) {
    return { ok: false, error: "This day has been locked." }
  }

  await prisma.kitchenLog.upsert({
    where: {
      dishId_outletId_date_shift: { dishId, outletId, date: day, shift },
    },
    update: { prepared, sold },
    create: { dishId, outletId, date: day, shift, prepared, sold },
  })

  return { ok: true }
}

export async function closeAndLockDay(
  outletId: string,
  date: string,
): Promise<KitchenActionResult> {
  const access = await assertOutletAccess(outletId)
  if (access.error) {
    return { ok: false, error: access.error }
  }

  const day = parseIsoDate(date)

  const logs = await prisma.kitchenLog.findMany({
    where: { outletId, date: day },
    include: { dish: { select: { name: true } } },
  })

  if (logs.length === 0) {
    return { ok: false, error: "There are no entries to lock for this day." }
  }

  const invalid = logs.find(
    (log) => log.prepared < 0 || log.sold < 0 || log.sold > log.prepared,
  )

  if (invalid) {
    return {
      ok: false,
      error: `"${invalid.dish.name}" has an invalid count (sold cannot exceed prepared).`,
    }
  }

  await prisma.kitchenLog.updateMany({
    where: { outletId, date: day },
    data: { isLocked: true },
  })

  return { ok: true }
}
