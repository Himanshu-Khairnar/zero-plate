"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireOutletActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const dishSchema = z.object({
  id: z.string().optional(),
  outletId: z.string().min(1),
  name: z.string().min(1).max(80).trim(),
  category: z.string().min(1).max(40).trim(),
  price: z.coerce.number().min(0),
  isVeg: z.boolean(),
  isActive: z.boolean().default(true),
});

export async function upsertDish(input: z.input<typeof dishSchema>) {
  return guarded(async () => {
    const data = dishSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: data.outletId }, select: { organizationId: true } });
    const dish = data.id
      ? await prisma.dish.update({
          where: { id: data.id },
          data: { name: data.name, category: data.category, price: data.price, isVeg: data.isVeg, isActive: data.isActive },
        })
      : await prisma.dish.create({
          data: {
            name: data.name,
            category: data.category,
            price: data.price,
            isVeg: data.isVeg,
            isActive: data.isActive,
            outletId: data.outletId,
            organizationId: outlet.organizationId,
            launchedAt: new Date().toISOString().slice(0, 10),
          },
        });
    await audit(viewer, data.id ? "dish.update" : "dish.create", { outletId: data.outletId, entity: "Dish", entityId: dish.id, detail: dish.name });
    revalidatePath("/menu");
    return { id: dish.id };
  });
}

export async function deleteDish(outletId: string, dishId: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER");
    const dish = await prisma.dish.findFirst({ where: { id: dishId, outletId } });
    if (!dish) throw new GuardError("Dish not found.");
    await prisma.dish.delete({ where: { id: dishId } });
    await audit(viewer, "dish.delete", { outletId, entity: "Dish", entityId: dishId, detail: dish.name });
    revalidatePath("/menu");
  });
}

const ingredientSchema = z.object({
  id: z.string().optional(),
  outletId: z.string().min(1),
  name: z.string().min(1).max(80).trim(),
  unit: z.enum(["kg", "l", "pcs"]),
  costPerUnit: z.coerce.number().min(0),
  shelfLifeDays: z.coerce.number().int().min(1).max(3650),
});

export async function upsertIngredient(input: z.input<typeof ingredientSchema>) {
  return guarded(async () => {
    const data = ingredientSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const row = data.id
      ? await prisma.ingredient.update({ where: { id: data.id }, data: { name: data.name, unit: data.unit, costPerUnit: data.costPerUnit, shelfLifeDays: data.shelfLifeDays } })
      : await prisma.ingredient.create({ data: { ...data, id: undefined } });
    await audit(viewer, data.id ? "ingredient.update" : "ingredient.create", { outletId: data.outletId, entity: "Ingredient", entityId: row.id, detail: row.name });
    revalidatePath("/menu");
    revalidatePath("/inventory");
    return { id: row.id };
  });
}

export async function deleteIngredient(outletId: string, ingredientId: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER");
    const used = await prisma.recipeItem.count({ where: { ingredientId } });
    if (used) throw new GuardError(`This ingredient is used in ${used} recipe${used === 1 ? "" : "s"}. Remove it from those first.`);
    await prisma.ingredient.delete({ where: { id: ingredientId, outletId } });
    await audit(viewer, "ingredient.delete", { outletId, entity: "Ingredient", entityId: ingredientId });
    revalidatePath("/menu");
  });
}

const recipeSchema = z.object({
  outletId: z.string().min(1),
  dishId: z.string().min(1),
  items: z.array(z.object({ ingredientId: z.string().min(1), qtyPerPlate: z.coerce.number().min(0) })),
});

/** Replace a dish's recipe with the given lines (zero quantities are dropped). */
export async function saveRecipe(input: z.input<typeof recipeSchema>) {
  return guarded(async () => {
    const data = recipeSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const dish = await prisma.dish.findFirst({ where: { id: data.dishId, outletId: data.outletId } });
    if (!dish) throw new GuardError("Dish not found.");
    const items = data.items.filter((i) => i.qtyPerPlate > 0);
    await prisma.$transaction([
      prisma.recipeItem.deleteMany({ where: { dishId: data.dishId } }),
      ...(items.length
        ? [prisma.recipeItem.createMany({ data: items.map((i) => ({ dishId: data.dishId, ingredientId: i.ingredientId, qtyPerPlate: i.qtyPerPlate })) })]
        : []),
    ]);
    await audit(viewer, "recipe.save", { outletId: data.outletId, entity: "Dish", entityId: data.dishId, detail: `${items.length} ingredients` });
    revalidatePath("/menu");
    revalidatePath("/prep-plan");
  });
}
