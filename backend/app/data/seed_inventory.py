"""Seed suppliers, price lists and opening stock for an outlet (Module D demo data).

    python -m app.data.seed_inventory                 # first outlet
    python -m app.data.seed_inventory --outlet <id>   # a specific outlet

Builds on the menu/sales seed (app.data.seed): three suppliers with lead
times and price lists for every ingredient, plus opening stock batches
sized to 3-6 days of typical usage with expiry dates. Two batches expire
tomorrow so the "use first" highlight has something to show.
Idempotent: the outlet's suppliers, stock movements and purchase orders are
replaced on each run.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta

import numpy as np
from sqlalchemy import text

from app import db

SUPPLIERS = [
    {"name": "Vasai Fresh Mandi", "contact": "+91 98200 11223 · mandi@vasaifresh.in", "lead": 1, "mult": 0.97,
     "units": {"kg"}},
    {"name": "Metro Cash & Carry", "contact": "orders@metro-cc.example", "lead": 2, "mult": 1.0, "units": {"kg", "l", "pcs"}},
    {"name": "Sahyadri Dairy & Bakery", "contact": "+91 93220 55667", "lead": 1, "mult": 1.05, "units": {"l", "pcs"}},
]


def _outlet(outlet_id: str | None) -> dict:
    if outlet_id:
        row = db.outlet(outlet_id)
        if not row:
            raise SystemExit(f"outlet {outlet_id} not found")
        return row
    outlets = db.all_outlets()
    if not outlets:
        raise SystemExit("no outlets; run the frontend seed and app.data.seed first")
    return outlets[0]


def seed(outlet_id: str | None = None, seed_value: int = 5) -> dict[str, str]:
    outlet = _outlet(outlet_id)
    rng = np.random.default_rng(seed_value)
    today = date.today()
    now = db.now_value()

    ingredients = db.read_df('SELECT * FROM "Ingredient" WHERE "outletId" = :o ORDER BY name', {"o": outlet["id"]})
    if ingredients.empty:
        raise SystemExit("outlet has no ingredients; run app.data.seed first")

    # Typical daily usage per ingredient: last 14 days of sales × recipe qty.
    usage = db.read_df(
        """
        SELECT r."ingredientId" AS ingredient_id,
               SUM(s."qtySold" * r."qtyPerPlate") / 14.0 AS daily
        FROM "SalesRecord" s
        JOIN "RecipeItem" r ON r."dishId" = s."dishId"
        JOIN "Dish" d ON d.id = s."dishId"
        WHERE d."outletId" = :o AND s.date >= :since
        GROUP BY r."ingredientId"
        """,
        {"o": outlet["id"], "since": (today - timedelta(days=14)).isoformat()},
    )
    daily = {r.ingredient_id: float(r.daily) for r in usage.itertuples()} if len(usage) else {}

    with db.engine().begin() as conn:
        conn.execute(text('DELETE FROM "PurchaseOrder" WHERE "outletId" = :o'), {"o": outlet["id"]})
        conn.execute(text('DELETE FROM "Supplier" WHERE "outletId" = :o'), {"o": outlet["id"]})
        conn.execute(
            text('DELETE FROM "StockMovement" WHERE "ingredientId" IN (SELECT id FROM "Ingredient" WHERE "outletId" = :o)'),
            {"o": outlet["id"]},
        )

        supplier_rows, price_rows = [], []
        for spec in SUPPLIERS:
            sid = db.new_id()
            supplier_rows.append({"id": sid, "name": spec["name"], "contact": spec["contact"], "lead": spec["lead"],
                                  "o": outlet["id"], "c": now})
            for ing in ingredients.itertuples():
                if ing.unit not in spec["units"]:
                    continue
                jitter = float(rng.uniform(-0.1, 0.1))
                price_rows.append({"id": db.new_id(), "s": sid, "i": ing.id,
                                   "p": round(float(ing.costPerUnit) * spec["mult"] * (1 + jitter), 2)})
        conn.execute(text('INSERT INTO "Supplier" (id, name, contact, "leadTimeDays", "outletId", "createdAt") '
                          'VALUES (:id, :name, :contact, :lead, :o, :c)'), supplier_rows)
        conn.execute(text('INSERT INTO "SupplierPrice" (id, "supplierId", "ingredientId", price) VALUES (:id, :s, :i, :p)'),
                     price_rows)

        move_rows = []
        soon = sorted(ingredients["id"].tolist())[:2]  # two batches expiring tomorrow
        for ing in ingredients.itertuples():
            per_day = daily.get(ing.id) or 0.5
            days = float(rng.uniform(3, 6))
            qty = per_day * days
            if ing.unit == "pcs":
                qty = float(np.ceil(qty))
            else:
                qty = round(qty, 3)
            if ing.id in soon:
                # a small older batch expiring tomorrow, then the main batch
                small = round(qty * 0.3, 3)
                move_rows.append({"id": db.new_id(), "i": ing.id, "type": "IN", "reason": "purchase", "qty": small,
                                  "exp": (today + timedelta(days=1)).isoformat(), "note": "opening stock (older batch)",
                                  "by": "seed", "c": now})
                qty = round(qty - small, 3)
            move_rows.append({"id": db.new_id(), "i": ing.id, "type": "IN", "reason": "purchase", "qty": qty,
                              "exp": (today + timedelta(days=int(ing.shelfLifeDays))).isoformat(),
                              "note": "opening stock", "by": "seed", "c": now})
        conn.execute(text('INSERT INTO "StockMovement" (id, "ingredientId", type, reason, qty, "expiryDate", note, "createdBy", "createdAt") '
                          'VALUES (:id, :i, :type, :reason, :qty, :exp, :note, :by, :c)'), move_rows)

    return {"outletId": outlet["id"], "outlet": outlet["name"], "suppliers": str(len(supplier_rows)),
            "prices": str(len(price_rows)), "stockBatches": str(len(move_rows))}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--outlet", default=None)
    ap.add_argument("--seed", type=int, default=5)
    args = ap.parse_args()
    for k, v in seed(args.outlet, args.seed).items():
        print(f"{k}: {v}")
