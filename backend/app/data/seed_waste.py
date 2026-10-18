"""Seed demo data for modules H (waste) and M (donations).

    python -m app.data.seed_waste                 # first outlet
    python -m app.data.seed_waste --outlet <id>

Adds three fictional NGOs for the outlet's city (invented names and placeholder
contacts), ~60 days of waste entries consistent with 3–8% of plates sold, and a
handful of past donations. Idempotent for the outlet (its waste rows and
donations are replaced; NGOs are matched by name).
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta

import numpy as np
from sqlalchemy import text

from app import db

NGOS = [
    {"name": "Annapurna Meal Bridge", "contact": "+91 98XXX 10001 · hello@annapurna.example", "address": "Near station road",
     "acceptsCooked": True, "pickupNote": "Pickup 9–10:30 pm; cooked food in sealed containers only."},
    {"name": "Seva Kitchen Collective", "contact": "+91 98XXX 10002 · seva@kitchen.example", "address": "Community hall, ward 4",
     "acceptsCooked": True, "pickupNote": "Call before 8 pm to arrange a volunteer pickup."},
    {"name": "GreenPlate Food Rescue", "contact": "+91 98XXX 10003 · rescue@greenplate.example", "address": "Market lane",
     "acceptsCooked": False, "pickupNote": "Dry and packaged surplus only; weekly collection on Fridays."},
]

REASON_WEIGHTS = [("overproduction", 0.62), ("spoilage", 0.14), ("plate_waste", 0.16), ("prep_loss", 0.08)]


def seed(outlet_id: str | None = None, days: int = 60, seed_value: int = 21) -> dict[str, str]:
    outlet = db.outlet(outlet_id) if outlet_id else (db.all_outlets() or [None])[0]
    if not outlet:
        raise SystemExit("no outlet found; run the frontend seed and app.data.seed first")
    oid = outlet["id"]
    rng = np.random.default_rng(seed_value)
    now = db.now_value()
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)

    dishes = db.dishes(oid, active_only=False)
    sales = db.daily_sales(oid)
    sales = sales[(sales["date"] >= start.isoformat()) & (sales["date"] <= end.isoformat())] if len(sales) else sales
    ingredients = db.fetch_all('SELECT id, name, unit FROM "Ingredient" WHERE "outletId" = :o', {"o": oid})

    with db.engine().begin() as conn:
        # NGOs: match by name so re-running does not duplicate.
        ngo_ids: list[str] = []
        for n in NGOS:
            row = conn.execute(text('SELECT id FROM "Ngo" WHERE name = :n AND city = :c'), {"n": n["name"], "c": outlet["city"]}).scalar()
            if row:
                ngo_ids.append(row)
                continue
            nid = db.new_id()
            conn.execute(text(
                'INSERT INTO "Ngo" (id, name, city, contact, address, "acceptsCooked", "pickupNote") '
                'VALUES (:id, :name, :city, :contact, :address, :acceptsCooked, :pickupNote)'),
                {"id": nid, "city": outlet["city"], **n})
            ngo_ids.append(nid)

        conn.execute(text('DELETE FROM "WasteLog" WHERE "outletId" = :o'), {"o": oid})
        conn.execute(text('DELETE FROM "Donation" WHERE "outletId" = :o'), {"o": oid})

        waste_rows: list[dict] = []
        if len(sales) and len(dishes):
            reasons = [r for r, _ in REASON_WEIGHTS]
            probs = np.array([w for _, w in REASON_WEIGHTS])
            for rec in sales.itertuples():
                # Only some dish-days get a waste entry; overall ~3–8% of plates.
                if rng.random() > 0.45:
                    continue
                share = float(rng.uniform(0.03, 0.08)) / 0.45
                qty = int(round(float(rec.qty) * share))
                if qty <= 0:
                    continue
                reason = str(rng.choice(reasons, p=probs))
                waste_rows.append({"id": db.new_id(), "o": oid, "d": rec.dish_id, "i": None, "date": rec.date,
                                   "qty": float(qty), "reason": reason, "note": None, "by": "Seed", "c": now})
            # A few ingredient-level spoilage/prep-loss rows.
            for _ in range(min(12, len(ingredients) * 2)):
                ing = ingredients[int(rng.integers(len(ingredients)))]
                day = start + timedelta(days=int(rng.integers(days)))
                qty = round(float(rng.uniform(0.2, 2.0)), 2) if ing["unit"] != "pcs" else float(int(rng.integers(2, 12)))
                waste_rows.append({"id": db.new_id(), "o": oid, "d": None, "i": ing["id"], "date": day.isoformat(),
                                   "qty": qty, "reason": str(rng.choice(["spoilage", "prep_loss"])), "note": None,
                                   "by": "Seed", "c": now})
        if waste_rows:
            conn.execute(text(
                'INSERT INTO "WasteLog" (id, "outletId", "dishId", "ingredientId", date, qty, reason, note, "loggedBy", "createdAt") '
                'VALUES (:id, :o, :d, :i, :date, :qty, :reason, :note, :by, :c)'), waste_rows)

        donation_rows = []
        names = list(dishes["name"]) if len(dishes) else ["Mixed meals"]
        for k in range(6):
            day = end - timedelta(days=int(rng.integers(2, days - 1)))
            picks = ", ".join(str(x) for x in rng.choice(names, size=min(2, len(names)), replace=False))
            donation_rows.append({"id": db.new_id(), "o": oid, "ngo": ngo_ids[k % 2], "date": day.isoformat(),
                                  "meals": int(rng.integers(8, 40)), "dishes": picks, "status": "COLLECTED",
                                  "note": None, "by": "Seed", "c": now})
        conn.execute(text(
            'INSERT INTO "Donation" (id, "outletId", "ngoId", date, meals, "dishNames", status, note, "createdBy", "createdAt") '
            'VALUES (:id, :o, :ngo, :date, :meals, :dishes, :status, :note, :by, :c)'), donation_rows)

    return {"outlet": outlet["name"], "ngos": str(len(ngo_ids)), "wasteRows": str(len(waste_rows)),
            "donations": str(len(donation_rows)), "from": start.isoformat(), "to": end.isoformat()}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--outlet", default=None)
    ap.add_argument("--days", type=int, default=60)
    args = ap.parse_args()
    for k, v in seed(args.outlet, args.days).items():
        print(f"{k}: {v}")
