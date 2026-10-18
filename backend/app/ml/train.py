"""Weekly training: compare candidates by backtest, fit the winner, version it.

Cold start: an outlet with less history than `cold_start_days` is trained on
every outlet's sales (a global model) so a new café gets usable forecasts
from day one. Dish identity is still a feature, so the model simply has no
dish-specific memory for the new outlet until its own data accumulates.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

import pandas as pd

from app import db
from app.config import settings
from app.external.weather import ensure_external_days
from app.ml import registry
from app.ml.backtest import compare, pick_winner
from app.ml.features import build_frame, training_rows
from app.ml.models import candidate_models, make_model

log = logging.getLogger(__name__)


class NotEnoughData(Exception):
    pass


def load_training_frame(outlet: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Feature frame for an outlet plus the metadata the artifact must keep."""
    own = db.daily_sales(outlet["id"])
    history_days = int(own["date"].nunique()) if len(own) else 0
    scope = "outlet"
    sales, dishes = own, db.dishes(outlet["id"], active_only=False)

    if history_days < settings.cold_start_days:
        scope = "global"
        sales = db.daily_sales(None)
        frames = [db.dishes(o["id"], active_only=False) for o in db.all_outlets()]
        dishes = pd.concat(frames, ignore_index=True) if frames else dishes
        if sales.empty:
            raise NotEnoughData("no sales history anywhere yet; import or seed sales first")

    end = date.fromisoformat(str(sales["date"].max())) if len(sales) else date.today()
    start = date.fromisoformat(str(sales["date"].min())) if len(sales) else end - timedelta(days=35)
    external = ensure_external_days(outlet, start, end, refresh_future=False)
    if scope == "global":
        # Weather is per city; for the global model use this outlet's city for
        # its own dishes and leave the rest to the per-day calendar features.
        pass

    dish_codes = {d: i for i, d in enumerate(dishes["id"])}
    category_codes = {c: i for i, c in enumerate(sorted(dishes["category"].unique()))}
    frame = build_frame(sales, dishes, external, end, dish_codes, category_codes)
    meta = {
        "scope": scope,
        "history_days": history_days,
        "dish_codes": dish_codes,
        "category_codes": category_codes,
        "train_start": start.isoformat(),
        "train_end": end.isoformat(),
    }
    return frame, meta


def train_outlet(outlet_id: str, promote: bool = True) -> dict[str, Any]:
    outlet = db.outlet(outlet_id)
    if not outlet:
        raise ValueError(f"outlet {outlet_id} not found")

    frame, meta = load_training_frame(outlet)
    rows = training_rows(frame)
    if len(rows) < 100:
        raise NotEnoughData(f"only {len(rows)} usable rows; need at least 100 (about 2 weeks for 7 dishes)")

    results = compare(candidate_models(), rows, settings.backtest_folds, settings.horizon_days)
    winner_name = pick_winner(results)
    winner = make_model(winner_name).fit(rows)

    version = registry.new_version()
    naive = next((r["overall"] for r in results if r["model"] == "naive"), None)
    best = next(r["overall"] for r in results if r["model"] == winner_name)
    comparison = {
        "winner": winner_name,
        "results": results,
        "improvement_vs_naive_pct": round((1 - best["mae"] / naive["mae"]) * 100, 1) if naive and naive["mae"] else None,
        "model_info": winner.info(),
        "features": meta,
        "train_rows": int(len(rows)),
    }
    registry.save(outlet_id, version, winner, {**meta, "version": version, "model": winner_name, "comparison": comparison})
    db.record_model_run(
        {
            "outletId": outlet_id,
            "version": version,
            "modelName": winner_name,
            "trainRows": int(len(rows)),
            "mae": best["mae"],
            "mape": best["mape"],
            "coverage": best["coverage"],
            "metricsJson": json.dumps(comparison, default=str),
        },
        promote=promote,
    )
    log.info("trained %s for outlet %s: %s (MAE %.2f, naive %.2f)", winner_name, outlet_id, version,
             best["mae"], naive["mae"] if naive else float("nan"))
    return {"outletId": outlet_id, "version": version, "model": winner_name, "promoted": promote, **comparison}
