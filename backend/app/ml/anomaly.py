"""Anomaly detection on daily dish sales (module K).

Unusual days usually mean a data-entry slip (a 3 typed instead of 30) or a
one-off event. Two detectors vote:

* a robust z-score: |qty - rolling median| / MAD over the previous 28 days;
* an Isolation Forest on [qty, lag_7, day of week, roll28 z-score].

A day is flagged when both agree, or when the z-score alone is extreme (> 5).
"""

from __future__ import annotations

import warnings
from dataclasses import asdict, dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app import db

Z_THRESHOLD = 3.5
Z_EXTREME = 5.0
MIN_HISTORY = 14
WINDOW = 28


@dataclass
class Flag:
    dishId: str
    dishName: str
    date: str
    qty: float
    expected: float
    zscore: float
    reason: str


def _scores(frame: pd.DataFrame) -> pd.DataFrame:
    """Per dish: rolling median / MAD z-score and the forest features."""
    frame = frame.sort_values(["dish_id", "date"]).copy()
    frame["date"] = pd.to_datetime(frame["date"])
    out = []
    for dish_id, g in frame.groupby("dish_id"):
        g = g.set_index("date")["qty"].asfreq("D").fillna(0.0).to_frame("qty")
        prev = g["qty"].shift(1)
        med = prev.rolling(WINDOW, min_periods=MIN_HISTORY).median()
        mad = (prev - med).abs().rolling(WINDOW, min_periods=MIN_HISTORY).median()
        scale = (1.4826 * mad).clip(lower=1.0)
        g["expected"] = med
        g["z"] = (g["qty"] - med) / scale
        g["lag_7"] = g["qty"].shift(7)
        g["dow"] = g.index.dayofweek
        g["dish_id"] = dish_id
        out.append(g.reset_index())
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def detect(sales: pd.DataFrame, dish_names: dict[str, str], since: date | None = None) -> list[Flag]:
    """Flag anomalous dish-days. `sales` has dish_id, date (ISO), qty."""
    if sales.empty:
        return []
    scored = _scores(sales)
    if scored.empty:
        return []
    scored = scored.dropna(subset=["expected", "z"])
    if scored.empty:
        return []

    feats = scored[["qty", "lag_7", "dow", "z"]].fillna(0.0).to_numpy(dtype=float)
    forest_flag = np.zeros(len(scored), dtype=bool)
    if len(scored) >= 50:
        from sklearn.ensemble import IsolationForest

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            iso = IsolationForest(n_estimators=200, contamination=0.02, random_state=42)
            forest_flag = iso.fit_predict(feats) == -1

    z = scored["z"].to_numpy(dtype=float)
    robust = np.abs(z) > Z_THRESHOLD
    flagged = (robust & forest_flag) | (np.abs(z) > Z_EXTREME)
    scored = scored[flagged]
    if since is not None:
        scored = scored[scored["date"] >= pd.Timestamp(since)]

    flags: list[Flag] = []
    for r in scored.itertuples():
        name = dish_names.get(str(r.dish_id), str(r.dish_id))
        when = r.date.strftime("%a %d %b")
        direction = "sold only" if r.z < 0 else "sold"
        hint = "possible data-entry error" if r.z < 0 or r.qty > 3 * max(r.expected, 1) else "unusual spike, check for an event or promotion"
        reason = f"{name} {direction} {int(round(r.qty))} on {when}, usually about {int(round(r.expected))} — {hint}"
        flags.append(Flag(str(r.dish_id), name, r.date.strftime("%Y-%m-%d"), float(r.qty), float(r.expected), round(float(r.z), 2), reason))
    flags.sort(key=lambda f: (f.date, -abs(f.zscore)), reverse=True)
    return flags


def scan_outlet(outlet_id: str, days: int = 14) -> list[dict]:
    sales = db.daily_sales(outlet_id)
    dishes = db.dishes(outlet_id, active_only=False)
    names = dict(zip(dishes["id"], dishes["name"])) if len(dishes) else {}
    since = date.today() - timedelta(days=days)
    return [asdict(f) for f in detect(sales, names, since)]
