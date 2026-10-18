"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { today } from "@/lib/dates";
import { audit, guarded, GuardError, requireOutletActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * Spreadsheet round-trip: download the outlet's data as a workbook, edit it,
 * upload it back. Rows are matched by name (case-insensitive); existing rows
 * are updated, new ones created, nothing is deleted.
 */

const dishRow = z.object({
  name: z.string().min(1).trim(),
  category: z.string().trim().optional(),
  price: z.coerce.number().min(0).optional(),
  isVeg: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const ingredientRow = z.object({
  name: z.string().min(1).trim(),
  unit: z.enum(["kg", "l", "pcs"]).optional(),
  costPerUnit: z.coerce.number().min(0).optional(),
  shelfLifeDays: z.coerce.number().int().min(1).optional(),
});
const recipeRow = z.object({ dish: z.string().min(1).trim(), ingredient: z.string().min(1).trim(), qtyPerPlate: z.coerce.number().min(0) });
const stockRow = z.object({ ingredient: z.string().min(1).trim(), onHand: z.coerce.number().min(0), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

const workbookSchema = z.object({
  outletId: z.string().min(1),
  dishes: z.array(dishRow).default([]),
  ingredients: z.array(ingredientRow).default([]),
  recipes: z.array(recipeRow).default([]),
  stock: z.array(stockRow).default([]),
});

export type SheetImportSummary = {
  dishes: { created: number; updated: number };
  ingredients: { created: number; updated: number };
  recipes: { saved: number; skipped: string[] };
  stock: { adjusted: number; skipped: string[] };
};

export async function importWorkbook(input: z.input<typeof workbookSchema>): Promise<{ ok: true; data: SheetImportSummary } | { ok: false; error: string }> {
  const r = await guarded(async () => {
    const data = workbookSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const outlet = await prisma.outlet.findUnique({ where: { id: data.outletId }, select: { organizationId: true } });
    if (!outlet) throw new GuardError("Outlet not found.");
    const summary: SheetImportSummary = { dishes: { created: 0, updated: 0 }, ingredients: { created: 0, updated: 0 }, recipes: { saved: 0, skipped: [] }, stock: { adjusted: 0, skipped: [] } };
    const key = (s: string) => s.trim().toLowerCase();

    // Ingredients first so recipes and stock can reference them.
    const ingredients = new Map((await prisma.ingredient.findMany({ where: { outletId: data.outletId } })).map((i) => [key(i.name), i]));
    for (const row of data.ingredients) {
      const existing = ingredients.get(key(row.name));
      if (existing) {
        const upd = await prisma.ingredient.update({ where: { id: existing.id }, data: { unit: row.unit ?? existing.unit, costPerUnit: row.costPerUnit ?? existing.costPerUnit, shelfLifeDays: row.shelfLifeDays ?? existing.shelfLifeDays } });
        ingredients.set(key(row.name), upd);
        summary.ingredients.updated++;
      } else {
        const created = await prisma.ingredient.create({ data: { name: row.name, unit: row.unit ?? "kg", costPerUnit: row.costPerUnit ?? 0, shelfLifeDays: row.shelfLifeDays ?? 3, outletId: data.outletId } });
        ingredients.set(key(row.name), created);
        summary.ingredients.created++;
      }
    }

    const dishes = new Map((await prisma.dish.findMany({ where: { outletId: data.outletId } })).map((d) => [key(d.name), d]));
    for (const row of data.dishes) {
      const existing = dishes.get(key(row.name));
      if (existing) {
        const upd = await prisma.dish.update({ where: { id: existing.id }, data: { category: row.category || existing.category, price: row.price ?? existing.price, isVeg: row.isVeg ?? existing.isVeg, isActive: row.isActive ?? existing.isActive } });
        dishes.set(key(row.name), upd);
        summary.dishes.updated++;
      } else {
        const created = await prisma.dish.create({ data: { name: row.name, category: row.category || "Mains", price: row.price ?? 0, isVeg: row.isVeg ?? true, isActive: row.isActive ?? true, outletId: data.outletId, organizationId: outlet.organizationId, launchedAt: today() } });
        dishes.set(key(row.name), created);
        summary.dishes.created++;
      }
    }

    // Recipes: replace the recipe of every dish mentioned in the sheet.
    const byDish = new Map<string, { ingredientId: string; qtyPerPlate: number }[]>();
    for (const row of data.recipes) {
      const dish = dishes.get(key(row.dish));
      const ing = ingredients.get(key(row.ingredient));
      if (!dish || !ing) { summary.recipes.skipped.push(`${row.dish} / ${row.ingredient}`); continue; }
      byDish.set(dish.id, [...(byDish.get(dish.id) ?? []), { ingredientId: ing.id, qtyPerPlate: row.qtyPerPlate }]);
    }
    for (const [dishId, items] of byDish) {
      await prisma.$transaction([
        prisma.recipeItem.deleteMany({ where: { dishId } }),
        prisma.recipeItem.createMany({ data: items.filter((i) => i.qtyPerPlate > 0).map((i) => ({ dishId, ...i })), skipDuplicates: true }),
      ]);
      summary.recipes.saved++;
    }

    // Stock: a physical count. Book the difference as an adjustment movement.
    for (const row of data.stock) {
      const ing = ingredients.get(key(row.ingredient));
      if (!ing) { summary.stock.skipped.push(row.ingredient); continue; }
      const moves = await prisma.stockMovement.findMany({ where: { ingredientId: ing.id }, select: { type: true, qty: true } });
      const onHand = moves.reduce((s, m) => s + (m.type === "IN" ? m.qty : -m.qty), 0);
      const diff = Math.round((row.onHand - onHand) * 1000) / 1000;
      if (Math.abs(diff) < 0.0005) continue;
      await prisma.stockMovement.create({
        data: { ingredientId: ing.id, type: diff > 0 ? "IN" : "OUT", reason: "adjustment", qty: Math.abs(diff), expiryDate: diff > 0 ? row.expiryDate ?? null : null, note: "Stock count from sheet", createdBy: viewer.name },
      });
      summary.stock.adjusted++;
    }

    await audit(viewer, "sheet.import", { outletId: data.outletId, entity: "Workbook", detail: JSON.stringify({ dishes: data.dishes.length, ingredients: data.ingredients.length, recipes: data.recipes.length, stock: data.stock.length }) });
    for (const p of ["/data", "/menu", "/inventory", "/prep-plan"]) revalidatePath(p);
    return summary;
  });
  if (!r.ok) return r;
  return { ok: true, data: r.data as SheetImportSummary };
}
