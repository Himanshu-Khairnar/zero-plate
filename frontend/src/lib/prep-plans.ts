import "server-only";

import { prisma } from "@/lib/prisma";
import { ml } from "@/lib/ml";
import {
  costPerPlate,
  ingredientNeeds,
  median,
  riskWeight,
  suggestedQty,
  type IngredientNeed,
  type RecipeLine,
} from "@/lib/prep";

export type PlanItemView = {
  id: string;
  dishId: string;
  dishName: string;
  category: string;
  price: number;
  forecastLow: number;
  forecastLikely: number;
  forecastHigh: number;
  riskWeight: number;
  costPerPlate: number;
  suggestedQty: number;
  plannedQty: number;
  explanation: string | null;
  recipe: RecipeLine[];
};

export type PlanView = {
  id: string;
  outletId: string;
  date: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  modelVersion: string | null;
  items: PlanItemView[];
  ingredients: IngredientNeed[];
  totals: { plates: number; prepCost: number; forecastLikely: number };
  adjustments: {
    id: string;
    dishName: string;
    fromQty: number;
    toQty: number;
    reason: string | null;
    adjustedBy: string;
    createdAt: string;
  }[];
};

export class PlanError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const planInclude = {
  items: { include: { dish: { include: { recipeItems: { include: { ingredient: true } } } } } },
  adjustments: { orderBy: { createdAt: "desc" as const } },
};

type PlanRecord = NonNullable<Awaited<ReturnType<typeof findPlan>>>;

function findPlan(outletId: string, date: string) {
  return prisma.prepPlan.findUnique({ where: { outletId_date: { outletId, date } }, include: planInclude });
}

/**
 * Build the day's draft from stored forecasts. If the nightly job has not run
 * for that day yet, ask the ML service for it first.
 */
async function createDraft(outletId: string, date: string): Promise<PlanRecord> {
  let forecasts = await prisma.forecast.findMany({ where: { outletId, date }, include: { dish: true } });
  if (forecasts.length === 0) {
    await ml.generateForecasts({ outletId, startDate: date, days: 1 });
    forecasts = await prisma.forecast.findMany({ where: { outletId, date }, include: { dish: true } });
  }
  forecasts = forecasts.filter((f) => f.dish.isActive);
  if (forecasts.length === 0) throw new PlanError("No active dishes to plan for.", 422);

  const dishes = await prisma.dish.findMany({
    where: { id: { in: forecasts.map((f) => f.dishId) } },
    include: { recipeItems: { include: { ingredient: true } } },
  });
  const costs = new Map(
    dishes.map((d) => [
      d.id,
      costPerPlate(d.recipeItems.map((r) => ({ qtyPerPlate: r.qtyPerPlate, costPerUnit: r.ingredient.costPerUnit }))),
    ]),
  );
  const medianCost = median([...costs.values()].filter((c) => c > 0));

  await prisma.prepPlan.create({
    data: {
      outletId,
      date,
      items: {
        create: forecasts.map((f) => {
          const cost = costs.get(f.dishId) ?? 0;
          const weight = riskWeight(cost, medianCost);
          const qty = suggestedQty({ low: f.low, likely: f.likely, high: f.high }, weight);
          return {
            dishId: f.dishId,
            forecastLow: f.low,
            forecastLikely: f.likely,
            forecastHigh: f.high,
            riskWeight: weight,
            costPerPlate: cost,
            suggestedQty: qty,
            plannedQty: qty,
          };
        }),
      },
    },
  });
  const created = await findPlan(outletId, date);
  if (!created) throw new PlanError("Plan creation failed.", 500);
  return created;
}

export async function getOrCreatePlan(outletId: string, date: string): Promise<PlanView> {
  const plan = (await findPlan(outletId, date)) ?? (await createDraft(outletId, date));
  return toView(plan);
}

export async function getPlanById(id: string): Promise<PlanView | null> {
  const plan = await prisma.prepPlan.findUnique({ where: { id }, include: planInclude });
  return plan ? toView(plan) : null;
}

/** Rebuild the draft from the latest forecasts (only while still a draft). */
export async function regenerateDraft(outletId: string, date: string): Promise<PlanView> {
  const existing = await prisma.prepPlan.findUnique({ where: { outletId_date: { outletId, date } } });
  if (existing && existing.status !== "DRAFT") {
    throw new PlanError(`Plan for ${date} is ${existing.status.toLowerCase()}; it cannot be regenerated.`, 409);
  }
  if (existing) await prisma.prepPlan.delete({ where: { id: existing.id } });
  await ml.generateForecasts({ outletId, startDate: date, days: 1 });
  return toView(await createDraft(outletId, date));
}

/**
 * Get-or-create for a day, refreshing a plan that is still a draft: no plan →
 * draft from forecasts; DRAFT → rebuilt from fresh forecasts; APPROVED/LOCKED →
 * returned unchanged.
 */
export async function generatePlan(outletId: string, date: string): Promise<PlanView> {
  const existing = await prisma.prepPlan.findUnique({ where: { outletId_date: { outletId, date } }, select: { status: true } });
  if (!existing) return getOrCreatePlan(outletId, date);
  if (existing.status === "DRAFT") return regenerateDraft(outletId, date);
  return getOrCreatePlan(outletId, date);
}

export async function adjustPlan(
  id: string,
  adjustedBy: string,
  changes: { dishId: string; plannedQty: number; reason?: string | null }[],
): Promise<PlanView> {
  const plan = await prisma.prepPlan.findUnique({ where: { id }, include: { items: true } });
  if (!plan) throw new PlanError("Plan not found.", 404);
  if (plan.status === "LOCKED") throw new PlanError("The day is closed; the plan is locked.", 409);

  const byDish = new Map(plan.items.map((i) => [i.dishId, i]));
  const ops = [];
  for (const c of changes) {
    const item = byDish.get(c.dishId);
    if (!item) throw new PlanError(`Dish ${c.dishId} is not on this plan.`, 404);
    const qty = Math.max(0, Math.round(Number(c.plannedQty)));
    if (!Number.isFinite(qty)) throw new PlanError("plannedQty must be a number.", 400);
    if (qty === item.plannedQty) continue;
    ops.push(
      prisma.prepPlanItem.update({ where: { id: item.id }, data: { plannedQty: qty } }),
      prisma.prepPlanAdjustment.create({
        data: { prepPlanId: id, dishId: c.dishId, fromQty: item.plannedQty, toQty: qty, reason: c.reason ?? null, adjustedBy },
      }),
    );
  }
  if (ops.length) await prisma.$transaction(ops);
  const fresh = await prisma.prepPlan.findUnique({ where: { id }, include: planInclude });
  return toView(fresh!);
}

export async function approvePlan(id: string, approvedBy: string, notes?: string | null): Promise<PlanView> {
  const plan = await prisma.prepPlan.findUnique({ where: { id } });
  if (!plan) throw new PlanError("Plan not found.", 404);
  if (plan.status === "LOCKED") throw new PlanError("The day is closed; the plan is locked.", 409);
  const items = await prisma.prepPlanItem.findMany({ where: { prepPlanId: id } });
  await prisma.$transaction([
    prisma.prepPlan.update({
      where: { id },
      data: { status: "APPROVED", approvedBy, approvedAt: new Date(), notes: notes ?? plan.notes },
    }),
    // Kitchen mode (module G) shows Dish.prepTarget; keep it in step with the approved plan.
    ...items.map((i) => prisma.dish.update({ where: { id: i.dishId }, data: { prepTarget: i.plannedQty } })),
  ]);
  const fresh = await prisma.prepPlan.findUnique({ where: { id }, include: planInclude });
  return toView(fresh!);
}

async function toView(plan: PlanRecord): Promise<PlanView> {
  const forecasts = await prisma.forecast.findMany({ where: { outletId: plan.outletId, date: plan.date } });
  const explanation = new Map(forecasts.map((f) => [f.dishId, f.explanation]));
  const modelVersion = forecasts[0]?.modelVersion ?? null;
  const dishName = new Map(plan.items.map((i) => [i.dishId, i.dish.name]));

  const items: PlanItemView[] = plan.items
    .map((i) => ({
      id: i.id,
      dishId: i.dishId,
      dishName: i.dish.name,
      category: i.dish.category,
      price: i.dish.price,
      forecastLow: i.forecastLow,
      forecastLikely: i.forecastLikely,
      forecastHigh: i.forecastHigh,
      riskWeight: i.riskWeight,
      costPerPlate: i.costPerPlate,
      suggestedQty: i.suggestedQty,
      plannedQty: i.plannedQty,
      explanation: explanation.get(i.dishId) ?? null,
      recipe: i.dish.recipeItems.map((r) => ({
        ingredientId: r.ingredientId,
        name: r.ingredient.name,
        unit: r.ingredient.unit,
        costPerUnit: r.ingredient.costPerUnit,
        qtyPerPlate: r.qtyPerPlate,
      })),
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.dishName.localeCompare(b.dishName));

  const ingredients = ingredientNeeds(items.map((i) => ({ dishName: i.dishName, plannedQty: i.plannedQty, recipe: i.recipe })));
  return {
    id: plan.id,
    outletId: plan.outletId,
    date: plan.date,
    status: plan.status,
    approvedBy: plan.approvedBy,
    approvedAt: plan.approvedAt?.toISOString() ?? null,
    notes: plan.notes,
    modelVersion,
    items,
    ingredients,
    totals: {
      plates: items.reduce((s, i) => s + i.plannedQty, 0),
      prepCost: Math.round(items.reduce((s, i) => s + i.plannedQty * i.costPerPlate, 0) * 100) / 100,
      forecastLikely: Math.round(items.reduce((s, i) => s + i.forecastLikely, 0)),
    },
    adjustments: plan.adjustments.map((a) => ({
      id: a.id,
      dishName: dishName.get(a.dishId) ?? a.dishId,
      fromQty: a.fromQty,
      toQty: a.toQty,
      reason: a.reason,
      adjustedBy: a.adjustedBy,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
