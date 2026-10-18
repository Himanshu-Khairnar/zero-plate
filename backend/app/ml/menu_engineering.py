"""Menu engineering (module I): group dishes by popularity and margin.

K-means (k=4) on standardised [avg plates/day, margin per plate]; clusters are
named by where their centre sits relative to the medians, which is the
classic star / plowhorse / puzzle / dog matrix.
"""

from __future__ import annotations

import warnings
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app import db

GROUPS = {
    ("high", "high"): ("star", "Keep it front and centre; protect quality and availability."),
    ("high", "low"): ("plowhorse", "Popular but thin margin — trim portion cost or nudge the price."),
    ("low", "high"): ("puzzle", "High margin, low sales — promote, rename or reposition on the menu."),
    ("low", "low"): ("dog", "Low sales and low margin — consider removing or reworking."),
}


def analyse(outlet_id: str, days: int = 28) -> dict:
    dishes = db.dishes(outlet_id, active_only=True)
    if dishes.empty:
        return {"outletId": outlet_id, "days": days, "dishes": [], "medians": None}
    sales = db.daily_sales(outlet_id)
    since = (date.today() - timedelta(days=days)).isoformat()
    recent = sales[sales["date"] >= since] if len(sales) else sales
    per_day = recent.groupby("dish_id")["qty"].sum() / max(days, 1) if len(recent) else pd.Series(dtype=float)
    costs = db.dish_costs(outlet_id).set_index("dish_id")["cost_per_plate"]

    rows = []
    for d in dishes.itertuples():
        pop = float(per_day.get(d.id, 0.0))
        cost = float(costs.get(d.id, 0.0))
        rows.append({"dishId": d.id, "name": d.name, "category": d.category, "price": float(d.price),
                     "costPerPlate": round(cost, 2), "popularity": round(pop, 2), "margin": round(float(d.price) - cost, 2)})
    df = pd.DataFrame(rows)
    pop_med, mar_med = float(df["popularity"].median()), float(df["margin"].median())

    labels = np.zeros(len(df), dtype=int)
    if len(df) >= 4:
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler

        X = StandardScaler().fit_transform(df[["popularity", "margin"]].to_numpy(dtype=float))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            labels = KMeans(n_clusters=4, n_init=10, random_state=42).fit_predict(X)
    df["cluster"] = labels

    # Name each cluster by its centre's quadrant; dishes inherit the name.
    names: dict[int, tuple[str, str]] = {}
    for c, g in df.groupby("cluster"):
        key = ("high" if g["popularity"].mean() >= pop_med else "low", "high" if g["margin"].mean() >= mar_med else "low")
        names[int(c)] = GROUPS[key]
    df["group"] = df["cluster"].map(lambda c: names[int(c)][0])
    df["suggestion"] = df["cluster"].map(lambda c: names[int(c)][1])

    counts = df["group"].value_counts().to_dict()
    return {
        "outletId": outlet_id,
        "days": days,
        "medians": {"popularity": round(pop_med, 2), "margin": round(mar_med, 2)},
        "counts": counts,
        "dishes": df.drop(columns=["cluster"]).sort_values(["group", "popularity"], ascending=[True, False]).to_dict("records"),
    }
