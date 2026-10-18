"""Precision check for the anomaly detector on injected spikes/drops."""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from app.data.synthetic import DISHES, generate
from app.ml.anomaly import detect


def _daily() -> tuple[pd.DataFrame, dict[str, str]]:
    end = date(2026, 10, 17)
    start = end - timedelta(days=16 * 7 - 1)
    _, sales, _ = generate(start, end, seed=5)
    name_to_id = {s.name: f"d{i}" for i, s in enumerate(DISHES)}
    daily = (
        pd.DataFrame(sales)
        .assign(dish_id=lambda d: d["dish"].map(name_to_id))
        .groupby(["dish_id", "date"], as_index=False)
        .agg(qty=("qtySold", "sum"))
    )
    return daily, {v: k for k, v in name_to_id.items()}


def test_injected_anomalies_are_flagged_with_few_false_positives():
    daily, names = _daily()
    clean = detect(daily, names)
    injected = [
        ("d0", "2026-10-15", 3.0),     # data-entry drop
        ("d2", "2026-10-10", 200.0),   # spike
        ("d4", "2026-10-05", 2.0),
        ("d6", "2026-09-28", 600.0),
        ("d9", "2026-10-13", 150.0),
    ]
    df = daily.copy()
    for dish, day, qty in injected:
        mask = (df["dish_id"] == dish) & (df["date"] == day)
        if mask.any():
            df.loc[mask, "qty"] = qty
        else:
            df = pd.concat([df, pd.DataFrame([{"dish_id": dish, "date": day, "qty": qty}])], ignore_index=True)
    flags = detect(df, names)
    hits = {(f.dishId, f.date) for f in flags} & {(d, day) for d, day, _ in injected}
    assert len(hits) >= 3, f"only caught {hits}"
    # Noise alone should produce few flags; injection must not add many extras.
    extras = len(flags) - len(hits)
    assert extras <= len(clean) + 3
    assert all("usually about" in f.reason for f in flags)
