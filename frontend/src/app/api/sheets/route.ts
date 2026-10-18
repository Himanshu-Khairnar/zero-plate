import * as XLSX from "xlsx";

import { handle, requireOutletAccess, requireString } from "@/lib/api";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/sheets?outletId=&type=workbook|sales-template
 * Downloads the outlet's data as an Excel workbook (Dishes, Ingredients,
 * Recipes, Stock) ready to edit and upload back on the Data Sheets page,
 * or an empty sales template for the Sales Import page.
 */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const outletId = requireString(url.searchParams.get("outletId"), "outletId");
  await requireOutletAccess(outletId);
  const type = url.searchParams.get("type") ?? "workbook";
  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { name: true } });
  const wb = XLSX.utils.book_new();

  if (type === "sales-template") {
    const rows = [
      { date: today(), dish: "Masala Dosa", qty: 42, price: 110, shift: "lunch" },
      { date: today(), dish: "Masala Dosa", qty: 30, price: 110, shift: "dinner" },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sales");
  } else {
    const [dishes, ingredients, recipes, movements] = await Promise.all([
      prisma.dish.findMany({ where: { outletId }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
      prisma.ingredient.findMany({ where: { outletId }, orderBy: { name: "asc" }, include: { stockMovements: { select: { type: true, qty: true, expiryDate: true } } } }),
      prisma.recipeItem.findMany({ where: { dish: { outletId } }, include: { dish: { select: { name: true } }, ingredient: { select: { name: true, unit: true } } } }),
      Promise.resolve(null),
    ]);
    void movements;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dishes.map((d) => ({ name: d.name, category: d.category, price: d.price, isVeg: d.isVeg ? "yes" : "no", isActive: d.isActive ? "yes" : "no" }))),
      "Dishes",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(ingredients.map((i) => ({ name: i.name, unit: i.unit, costPerUnit: i.costPerUnit, shelfLifeDays: i.shelfLifeDays }))),
      "Ingredients",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(recipes.map((r) => ({ dish: r.dish.name, ingredient: r.ingredient.name, unit: r.ingredient.unit, qtyPerPlate: r.qtyPerPlate }))),
      "Recipes",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        ingredients.map((i) => {
          const onHand = i.stockMovements.reduce((s, m) => s + (m.type === "IN" ? m.qty : -m.qty), 0);
          const nextExpiry = i.stockMovements.filter((m) => m.type === "IN" && m.expiryDate && m.expiryDate >= today()).map((m) => m.expiryDate!).sort()[0] ?? "";
          return { ingredient: i.name, unit: i.unit, onHand: Math.round(onHand * 1000) / 1000, expiryDate: nextExpiry };
        }),
      ),
      "Stock",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["How to use this workbook"],
        ["Edit the Dishes, Ingredients, Recipes and Stock sheets, then upload the file on the Data Sheets page."],
        ["Rows are matched by name. Existing rows are updated, new names are created, nothing is deleted."],
        ["Stock: enter the counted quantity on hand; the difference is booked as an adjustment."],
        ["Recipes: all rows for a dish replace that dish's recipe. qtyPerPlate is in the ingredient's unit."],
      ]),
      "Read me",
    );
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const name = `${outlet.name.replace(/[^\w]+/g, "-")}-${type === "sales-template" ? "sales-template" : "data"}-${today()}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
});
