"""Plain-language reasons for a forecast.

This is the rule-based layer that ships with the forecasting engine so every
number has a sentence next to it from day one. Megh's SHAP work (module I)
plugs in here: `feature_reasons` can be replaced by SHAP-ranked reasons
without touching the callers.
"""

from __future__ import annotations

import math

import pandas as pd

DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _num(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def feature_reasons(row: pd.Series) -> list[str]:
    reasons: list[str] = []
    if int(row.get("is_holiday", 0) or 0):
        name = row.get("holiday_name")
        reasons.append(f"it is {name}" if isinstance(name, str) and name else "it is a public holiday")
    elif int(row.get("is_weekend", 0) or 0):
        reasons.append(f"it is {DOW[int(row['dow'])]}")
    elif _num(row.get("days_to_holiday")) is not None and row["days_to_holiday"] <= 1:
        reasons.append("a holiday is coming up")

    rain = _num(row.get("rain_mm"))
    if rain is not None and rain >= 10:
        reasons.append("heavy rain is expected")
    elif rain is not None and rain >= 3:
        reasons.append("rain is expected")

    t_max = _num(row.get("temp_max"))
    if t_max is not None and t_max >= 35:
        reasons.append("it will be very hot")

    if int(row.get("promo", 0) or 0):
        reasons.append("the dish is on promotion")
    if int(row.get("is_payday", 0) or 0):
        reasons.append("it is around payday")

    r7, r28 = _num(row.get("roll7_mean")), _num(row.get("roll28_mean"))
    if r7 is not None and r28 and r28 > 0:
        ratio = r7 / r28
        if ratio >= 1.15:
            reasons.append("sales have been rising recently")
        elif ratio <= 0.85:
            reasons.append("sales have been falling recently")
    return reasons


def explain(row: pd.Series, low: float, likely: float, high: float) -> str:
    usual = _num(row.get("roll28_mean"))
    reasons = feature_reasons(row)
    if usual is None or usual <= 0:
        head = "First weeks of data, so this is a cautious estimate"
    elif likely >= usual * 1.10:
        head = "Higher than usual"
    elif likely <= usual * 0.90:
        head = "Lower than usual"
    else:
        head = "About the usual level"

    if reasons:
        if len(reasons) == 1:
            why = reasons[0]
        else:
            why = ", ".join(reasons[:-1]) + " and " + reasons[-1]
        head += f" because {why}"
    tail = f" (usually about {usual:.0f} plates)" if usual else ""
    return f"{head}{tail}. Expect around {likely:.0f} plates, between {low:.0f} and {high:.0f}."
