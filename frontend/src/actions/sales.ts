"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireOutletActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dish: z.string().min(1).trim(),
  qty: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0).optional(),
  shift: z.enum(["lunch", "dinner", "all"]).default("all"),
});

const importSchema = z.object({
  outletId: z.string().min(1),
  rows: z.array(rowSchema).min(1).max(50000),
  mode: z.enum(["append", "replace_days"]).default("replace_days"),
  createMissingDishes: z.boolean().default(false),
});

export type ImportSummary = {
  inserted: number;
  daysReplaced: number;
  unknownDishes: string[];
  createdDishes: string[];
};

/**
 * Import cleaned sales rows (from the CSV wizard, manual entry or the POS API).
 * Dish names are matched case-insensitively to the outlet's menu.
 * "replace_days" removes any existing rows for the (dish, day) pairs being
 * imported so a re-upload never double counts.
 */
export async function importSales(input: z.input<typeof importSchema>): Promise<{ ok: true; data: ImportSummary } | { ok: false; error: string }> {
  const r = await guarded(async () => {
    const data = importSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    return runImport(data, viewer.name, viewer);
  });
  if (!r.ok) return r;
  return { ok: true, data: r.data as ImportSummary };
}

export async function runImport(
  data: z.output<typeof importSchema>,
  actorName: string,
  viewer?: Parameters<typeof audit>[0],
): Promise<ImportSummary> {
  const outlet = await prisma.outlet.findUnique({ where: { id: data.outletId }, select: { organizationId: true } });
  if (!outlet) throw new GuardError("Outlet not found.");
  const dishes = await prisma.dish.findMany({ where: { outletId: data.outletId }, select: { id: true, name: true, price: true } });
  const byName = new Map(dishes.map((d) => [d.name.trim().toLowerCase(), d]));

  const unknown = new Set<string>();
  const created: string[] = [];
  for (const row of data.rows) {
    const key = row.dish.trim().toLowerCase();
    if (byName.has(key)) continue;
    if (data.createMissingDishes) {
      const d = await prisma.dish.create({
        data: { name: row.dish.trim(), price: row.price ?? 0, outletId: data.outletId, organizationId: outlet.organizationId, launchedAt: row.date },
        select: { id: true, name: true, price: true },
      });
      byName.set(key, d);
      created.push(d.name);
    } else {
      unknown.add(row.dish.trim());
    }
  }

  const valid = data.rows.filter((r) => byName.has(r.dish.trim().toLowerCase()));
  const pairs = new Set(valid.map((r) => `${byName.get(r.dish.trim().toLowerCase())!.id}|${r.date}`));

  let daysReplaced = 0;
  if (data.mode === "replace_days" && pairs.size) {
    const byDish = new Map<string, string[]>();
    for (const p of pairs) {
      const [dishId, date] = p.split("|");
      byDish.set(dishId, [...(byDish.get(dishId) ?? []), date]);
    }
    for (const [dishId, dates] of byDish) {
      const res = await prisma.salesRecord.deleteMany({ where: { dishId, date: { in: dates } } });
      daysReplaced += res.count;
    }
  }

  const chunks: typeof valid[] = [];
  for (let i = 0; i < valid.length; i += 1000) chunks.push(valid.slice(i, i + 1000));
  let inserted = 0;
  for (const chunk of chunks) {
    const res = await prisma.salesRecord.createMany({
      data: chunk.map((r) => {
        const dish = byName.get(r.dish.trim().toLowerCase())!;
        return { dishId: dish.id, date: r.date, shift: r.shift, qtySold: r.qty, price: r.price ?? dish.price };
      }),
    });
    inserted += res.count;
  }

  if (viewer) {
    await audit(viewer, "sales.import", { outletId: data.outletId, entity: "SalesRecord", detail: `${inserted} rows by ${actorName}` });
  } else {
    await prisma.auditLog.create({ data: { organizationId: outlet.organizationId, outletId: data.outletId, userName: actorName, action: "sales.import", entity: "SalesRecord", detail: `${inserted} rows via POS API` } });
  }
  revalidatePath("/sales");
  revalidatePath("/forecasts");
  revalidatePath("/analytics");
  return { inserted, daysReplaced, unknownDishes: [...unknown], createdDishes: created };
}

const manualSchema = z.object({
  outletId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(["lunch", "dinner", "all"]),
  entries: z.array(z.object({ dishId: z.string().min(1), qty: z.coerce.number().int().min(0) })),
});

/** Manual daily entry for outlets without a POS. Replaces that day+shift. */
export async function saveManualSales(input: z.input<typeof manualSchema>) {
  return guarded(async () => {
    const data = manualSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
    const dishes = await prisma.dish.findMany({ where: { outletId: data.outletId, id: { in: data.entries.map((e) => e.dishId) } }, select: { id: true, price: true } });
    const price = new Map(dishes.map((d) => [d.id, d.price]));
    await prisma.$transaction([
      prisma.salesRecord.deleteMany({ where: { date: data.date, shift: data.shift, dishId: { in: dishes.map((d) => d.id) } } }),
      prisma.salesRecord.createMany({
        data: data.entries.filter((e) => e.qty > 0 && price.has(e.dishId)).map((e) => ({ dishId: e.dishId, date: data.date, shift: data.shift, qtySold: e.qty, price: price.get(e.dishId)! })),
      }),
    ]);
    await audit(viewer, "sales.manual", { outletId: data.outletId, entity: "SalesRecord", detail: `${data.date} ${data.shift}` });
    revalidatePath("/sales");
    revalidatePath("/forecasts");
  });
}
