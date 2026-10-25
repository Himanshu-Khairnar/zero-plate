"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireOutletActor } from "@/lib/guard";
import { addDays, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { suggestPurchaseOrders } from "@/lib/stock";

const PATHS = ["/inventory", "/prep-plan", "/dashboard"];
function revalidate() {
  for (const p of PATHS) revalidatePath(p);
}

const supplierSchema = z.object({
  id: z.string().optional(),
  outletId: z.string().min(1),
  name: z.string().min(1).max(80).trim(),
  contact: z.string().max(120).trim().optional().or(z.literal("")),
  leadTimeDays: z.coerce.number().int().min(0).max(60),
});

export async function upsertSupplier(input: z.input<typeof supplierSchema>) {
  return guarded(async () => {
    const data = supplierSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const row = data.id
      ? await prisma.supplier.update({ where: { id: data.id, outletId: data.outletId }, data: { name: data.name, contact: data.contact || null, leadTimeDays: data.leadTimeDays } })
      : await prisma.supplier.create({ data: { outletId: data.outletId, name: data.name, contact: data.contact || null, leadTimeDays: data.leadTimeDays } });
    await audit(viewer, data.id ? "supplier.update" : "supplier.create", { outletId: data.outletId, entity: "Supplier", entityId: row.id, detail: row.name });
    revalidate();
    return { id: row.id };
  });
}

export async function deleteSupplier(outletId: string, supplierId: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER");
    const s = await prisma.supplier.findFirst({ where: { id: supplierId, outletId } });
    if (!s) throw new GuardError("Supplier not found.");
    await prisma.supplier.delete({ where: { id: supplierId } });
    await audit(viewer, "supplier.delete", { outletId, entity: "Supplier", entityId: supplierId, detail: s.name });
    revalidate();
  });
}

const priceSchema = z.object({
  outletId: z.string().min(1),
  supplierId: z.string().min(1),
  prices: z.array(z.object({ ingredientId: z.string().min(1), price: z.coerce.number().min(0).nullable() })),
});

/** Replace a supplier's price list; null/empty price removes the line. */
export async function setSupplierPrice(input: z.input<typeof priceSchema>) {
  return guarded(async () => {
    const data = priceSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, outletId: data.outletId } });
    if (!supplier) throw new GuardError("Supplier not found.");
    const keep = data.prices.filter((p) => p.price != null && p.price > 0);
    await prisma.$transaction([
      prisma.supplierPrice.deleteMany({ where: { supplierId: data.supplierId } }),
      ...(keep.length ? [prisma.supplierPrice.createMany({ data: keep.map((p) => ({ supplierId: data.supplierId, ingredientId: p.ingredientId, price: p.price as number })) })] : []),
    ]);
    await audit(viewer, "supplier.prices", { outletId: data.outletId, entity: "Supplier", entityId: data.supplierId, detail: `${keep.length} prices` });
    revalidate();
  });
}

const movementSchema = z.object({
  outletId: z.string().min(1),
  ingredientId: z.string().min(1),
  type: z.enum(["IN", "OUT"]),
  reason: z.enum(["purchase", "usage", "waste", "expired", "adjustment"]),
  qty: z.coerce.number().positive(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  note: z.string().max(200).trim().optional().or(z.literal("")),
});

export async function recordStockMovement(input: z.input<typeof movementSchema>) {
  return guarded(async () => {
    const data = movementSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
    const ing = await prisma.ingredient.findFirst({ where: { id: data.ingredientId, outletId: data.outletId } });
    if (!ing) throw new GuardError("Ingredient not found.");
    const expiry = data.type === "IN" ? data.expiryDate || addDays(today(), ing.shelfLifeDays) : null;
    const row = await prisma.stockMovement.create({
      data: { ingredientId: ing.id, type: data.type, reason: data.reason, qty: data.qty, expiryDate: expiry, note: data.note || null, createdBy: viewer.name },
    });
    await audit(viewer, "stock.movement", { outletId: data.outletId, entity: "StockMovement", entityId: row.id, detail: `${data.type} ${data.qty} ${ing.unit} ${ing.name} (${data.reason})` });
    revalidate();
    return { id: row.id };
  });
}

/** Persist SUGGESTED purchase orders from the forecast, replacing earlier suggestions. */
export async function createSuggestedOrders(outletId: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER");
    const suggestions = await suggestPurchaseOrders(outletId);
    await prisma.purchaseOrder.deleteMany({ where: { outletId, status: "SUGGESTED" } });
    for (const s of suggestions) {
      await prisma.purchaseOrder.create({
        data: {
          outletId,
          supplierId: s.supplierId,
          status: "SUGGESTED",
          expectedDate: s.expectedDate,
          createdBy: "Zero Plate forecast",
          note: `Covers ${s.leadTimeDays + 1} days of forecast demand`,
          items: { create: s.items.map((i) => ({ ingredientId: i.ingredientId, qty: i.qty, unitPrice: i.unitPrice })) },
        },
      });
    }
    await audit(viewer, "po.suggest", { outletId, entity: "PurchaseOrder", detail: `${suggestions.length} orders, ${suggestions.reduce((n, s) => n + s.items.length, 0)} lines` });
    revalidate();
    return { orders: suggestions.length };
  });
}

const statusSchema = z.object({
  outletId: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  status: z.enum(["ORDERED", "RECEIVED", "CANCELLED"]),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

const TRANSITIONS: Record<string, string[]> = {
  SUGGESTED: ["ORDERED", "CANCELLED"],
  ORDERED: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

export async function updatePurchaseOrderStatus(input: z.input<typeof statusSchema>) {
  return guarded(async () => {
    const data = statusSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const po = await prisma.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, outletId: data.outletId }, include: { items: { include: { ingredient: true } }, supplier: true } });
    if (!po) throw new GuardError("Purchase order not found.");
    if (!TRANSITIONS[po.status]?.includes(data.status)) throw new GuardError(`Cannot move an order from ${po.status.toLowerCase()} to ${data.status.toLowerCase()}.`);

    const ops = [];
    ops.push(
      prisma.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: data.status,
          expectedDate: data.expectedDate || po.expectedDate || (data.status === "ORDERED" ? addDays(today(), po.supplier?.leadTimeDays ?? 2) : undefined),
          receivedAt: data.status === "RECEIVED" ? new Date() : undefined,
        },
      }),
    );
    if (data.status === "RECEIVED") {
      for (const item of po.items) {
        ops.push(
          prisma.stockMovement.create({
            data: {
              ingredientId: item.ingredientId,
              type: "IN",
              reason: "purchase",
              qty: item.qty,
              expiryDate: addDays(today(), item.ingredient.shelfLifeDays),
              note: `PO ${po.id.slice(-6)}${po.supplier ? ` · ${po.supplier.name}` : ""}`,
              createdBy: viewer.name,
            },
          }),
        );
      }
    }
    await prisma.$transaction(ops);
    await audit(viewer, `po.${data.status.toLowerCase()}`, { outletId: data.outletId, entity: "PurchaseOrder", entityId: po.id, detail: `${po.items.length} lines` });
    revalidate();
  });
}

const itemsSchema = z.object({
  outletId: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  items: z.array(z.object({ ingredientId: z.string().min(1), qty: z.coerce.number().min(0), unitPrice: z.coerce.number().min(0) })),
});

/** Edit lines on a SUGGESTED/ORDERED order (zero qty removes the line). */
export async function editPurchaseOrderItems(input: z.input<typeof itemsSchema>) {
  return guarded(async () => {
    const data = itemsSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER");
    const po = await prisma.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, outletId: data.outletId } });
    if (!po) throw new GuardError("Purchase order not found.");
    if (po.status === "RECEIVED" || po.status === "CANCELLED") throw new GuardError("This order can no longer be edited.");
    const keep = data.items.filter((i) => i.qty > 0);
    await prisma.$transaction([
      prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } }),
      ...(keep.length ? [prisma.purchaseOrderItem.createMany({ data: keep.map((i) => ({ purchaseOrderId: po.id, ingredientId: i.ingredientId, qty: i.qty, unitPrice: i.unitPrice })) })] : []),
    ]);
    await audit(viewer, "po.edit", { outletId: data.outletId, entity: "PurchaseOrder", entityId: po.id, detail: `${keep.length} lines` });
    revalidate();
  });
}
