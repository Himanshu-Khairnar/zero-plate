"""Rolling-origin backtesting: the only honest way to compare forecasters.

For each of the last N weeks we pretend that week has not happened, train on
everything before it, forecast the 7 days, and score against the truth.
"""

from __future__ import annotations

import copy
import logging
from typing import Any

import numpy as np
import pandas as pd

from app.ml.models import ForecastModel

log = logging.getLogger(__name__)


def metrics(actual: pd.Series, pred: pd.DataFrame) -> dict[str, float]:
    a = actual.to_numpy(dtype=float)
    p = pred["likely"].to_numpy(dtype=float)
    err = p - a
    nonzero = a > 0
    mape = float(np.mean(np.abs(err[nonzero]) / a[nonzero]) * 100) if nonzero.any() else float("nan")
    denom = (np.abs(a) + np.abs(p)) / 2
    smape = float(np.mean(np.where(denom > 0, np.abs(err) / np.where(denom > 0, denom, 1), 0)) * 100)
    inside = (a >= pred["low"].to_numpy()) & (a <= pred["high"].to_numpy())
    return {
        "mae": round(float(np.mean(np.abs(err))), 3),
        "mape": round(mape, 2),
        "smape": round(smape, 2),
        "bias": round(float(np.mean(err)), 3),
        "coverage": round(float(np.mean(inside)), 3),
        "range_width": round(float(np.mean(pred["high"] - pred["low"])), 2),
        "n": int(len(a)),
    }


def rolling_backtest(
    model: ForecastModel,
    rows: pd.DataFrame,
    folds: int = 4,
    horizon: int = 7,
) -> dict[str, Any]:
    """Return overall metrics plus per-fold metrics for one model."""
    last = rows["date"].max()
    preds, actuals, fold_metrics = [], [], []
    for k in range(folds, 0, -1):
        origin = last - pd.Timedelta(days=horizon * k)
        train = rows[rows["date"] <= origin]
        test = rows[(rows["date"] > origin) & (rows["date"] <= origin + pd.Timedelta(days=horizon))]
        if len(train) < 50 or test.empty:
            continue
        m = copy.deepcopy(model).fit(train)
        p = m.predict(test)
        preds.append(p)
        actuals.append(test["qty"])
        fold_metrics.append({"origin": origin.strftime("%Y-%m-%d"), **metrics(test["qty"], p)})
    if not preds:
        return {"model": model.name, "overall": None, "folds": []}
    overall = metrics(pd.concat(actuals), pd.concat(preds))
    return {"model": model.name, "overall": overall, "folds": fold_metrics}


def compare(models: list[ForecastModel], rows: pd.DataFrame, folds: int, horizon: int) -> list[dict[str, Any]]:
    results = []
    for m in models:
        try:
            results.append(rolling_backtest(m, rows, folds, horizon))
        except Exception as exc:  # a broken optional model must not block retraining
            log.exception("backtest failed for %s", m.name)
            results.append({"model": m.name, "overall": None, "folds": [], "error": str(exc)})
    return results


def pick_winner(results: list[dict[str, Any]]) -> str:
    scored = [(r["overall"]["mae"], r["model"]) for r in results if r.get("overall")]
    if not scored:
        return "seasonal_naive"
    scored.sort()
    return scored[0][1]
