"""Seed demo menu, recipes and sales history for forecasting.

    python -m app.data.seed                  # first outlet, 26 weeks ending yesterday
    python -m app.data.seed --outlet <id>    # a specific outlet
    python -m app.data.seed --weeks 12       # shorter history (exercises cold start)

The organisation, outlets and users come from the frontend seed
(`npx prisma db seed`, Module A). This adds what modules E/F/J need on top:
a 12-dish menu with recipes, 18 ingredients and realistic daily sales.
If no outlet exists yet, a demo organisation and outlet are created.
Idempotent: the demo menu for the outlet is replaced on each run.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta

from sqlalchemy import text

from app import db
from app.data.synthetic import DISHES, INGREDIENTS, generate

FALLBACK_ORG = "Khairnar Hospitality"
FALLBACK_OUTLET = {"name": "Vasai Tiffin & Café", "city": "Vasai", "latitude": 19.3919,
                   "longitude": 72.8397, "timezone": "Asia/Kolkata"}
# Vasai/Mumbai coordinates for outlets that were created without a location.
DEFAULT_COORDS = (19.0760, 72.8777)


def _ensure_outlet(outlet_id: str | None) -> dict:
    if outlet_id:
        row = db.outlet(outlet_id)
        if not row:
            raise SystemExit(f"outlet {outlet_id} not found")
        return row
    outlets = db.all_outlets()
    if outlets:
        return outlets[0]
    now = db.now_value()
    org_id, oid = db.new_id(), db.new_id()
    plan_cast = "CAST(:p AS \"Plan\")" if not db.is_sqlite() else ":p"
    with db.engine().begin() as conn:
        conn.execute(text(f'INSERT INTO "Organization" (id, name, plan, "createdAt", "updatedAt") '
                          f'VALUES (:id, :n, {plan_cast}, :c, :c)'),
                     {"id": org_id, "n": FALLBACK_ORG, "p": "PRO", "c": now})
        conn.execute(text('INSERT INTO "Outlet" (id, name, city, latitude, longitude, timezone, "organizationId", '
                          '"createdAt", "updatedAt") VALUES (:id, :name, :city, :latitude, :longitude, :timezone, :org, :c, :c)'),
                     {"id": oid, **FALLBACK_OUTLET, "org": org_id, "c": now})
    return db.outlet(oid)  # type: ignore[return-value]


def seed(outlet_id: str | None = None, weeks: int = 26, seed_value: int = 7) -> dict[str, str]:
    outlet = _ensure_outlet(outlet_id)
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=weeks * 7 - 1)
    weather, sales, hols = generate(start, end, seed_value)
    now = db.now_value()
    names = [s.name for s in DISHES]

    with db.engine().begin() as conn:
        if db.is_sqlite():
            conn.execute(text("PRAGMA foreign_keys = ON"))
        if outlet.get("latitude") is None or outlet.get("longitude") is None:
            conn.execute(text('UPDATE "Outlet" SET latitude = :la, longitude = :lo, timezone = :tz WHERE id = :id'),
                         {"la": DEFAULT_COORDS[0], "lo": DEFAULT_COORDS[1], "tz": "Asia/Kolkata", "id": outlet["id"]})

        # Replace this outlet's demo menu (cascades remove recipes, sales, forecasts, plans).
        old = conn.execute(text('SELECT id FROM "Dish" WHERE "outletId" = :o'), {"o": outlet["id"]}).scalars().all()
        for did in old:
            conn.execute(text('DELETE FROM "Dish" WHERE id = :id'), {"id": did})
        conn.execute(text('DELETE FROM "Ingredient" WHERE "outletId" = :o'), {"o": outlet["id"]})
        conn.execute(text('DELETE FROM "ExternalDay" WHERE city = :c AND source = :s'),
                     {"c": outlet["city"], "s": "synthetic"})

        ing_ids: dict[str, str] = {}
        ing_rows = []
        for name, (unit, cost, shelf) in INGREDIENTS.items():
            ing_ids[name] = db.new_id()
            ing_rows.append({"id": ing_ids[name], "name": name, "unit": unit, "cost": cost, "shelf": shelf, "o": outlet["id"]})
        conn.execute(text('INSERT INTO "Ingredient" (id, name, unit, "costPerUnit", "shelfLifeDays", "outletId") '
                          'VALUES (:id, :name, :unit, :cost, :shelf, :o)'), ing_rows)

        dish_ids: dict[str, str] = {}
        dish_rows, recipe_rows = [], []
        for spec in DISHES:
            dish_ids[spec.name] = db.new_id()
            dish_rows.append({"id": dish_ids[spec.name], "name": spec.name, "category": spec.category,
                              "price": spec.price, "veg": spec.is_veg, "active": True, "target": int(spec.base),
                              "launched": start.isoformat(), "o": outlet["id"], "org": outlet["organizationId"], "c": now})
            for ing, qty in spec.recipe:
                recipe_rows.append({"id": db.new_id(), "d": dish_ids[spec.name], "i": ing_ids[ing], "q": qty})
        conn.execute(text(
            'INSERT INTO "Dish" (id, name, category, price, "isVeg", "isActive", "prepTarget", "launchedAt", '
            '"outletId", "organizationId", "createdAt", "updatedAt") '
            'VALUES (:id, :name, :category, :price, :veg, :active, :target, :launched, :o, :org, :c, :c)'), dish_rows)
        conn.execute(text('INSERT INTO "RecipeItem" (id, "dishId", "ingredientId", "qtyPerPlate") VALUES (:id, :d, :i, :q)'),
                     recipe_rows)
        conn.execute(text('INSERT INTO "SalesRecord" (id, "dishId", date, shift, "qtySold", price) '
                          'VALUES (:id, :d, :date, :shift, :q, :p)'),
                     [{"id": db.new_id(), "d": dish_ids[r["dish"]], "date": r["date"], "shift": r["shift"],
                       "q": r["qtySold"], "p": r["price"]} for r in sales])

    db.upsert_external_days([
        {**wx, "city": outlet["city"], "date": iso, "isHoliday": iso in hols, "holidayName": hols.get(iso), "source": "synthetic"}
        for iso, wx in weather.items()
    ])
    return {"outletId": outlet["id"], "outlet": outlet["name"], "dishes": str(len(DISHES)),
            "salesRows": str(len(sales)), "from": start.isoformat(), "to": end.isoformat()}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--outlet", default=None)
    ap.add_argument("--weeks", type=int, default=26)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    for k, v in seed(args.outlet, args.weeks, args.seed).items():
        print(f"{k}: {v}")
