"""Serving: nightly forecasts and what-if scenarios from the active model."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import pandas as pd

from app import db
from app.config import settings
from app.external.weather import ensure_external_days
from app.ml import registry
from app.ml.explain import explain
from app.ml.features import build_frame
from app.ml.models import ForecastModel
from app.ml.train import train_outlet

log = logging.getLogger(__name__)


def _load_active(outlet_id: str) -> tuple[ForecastModel, dict[str, Any], str]:
    run = db.active_model_run(outlet_id)
    if run is None or not registry.exists(outlet_id, run["version"]):
        log.info("no active model for %s, training now", outlet_id)
        train_outlet(outlet_id, promote=True)
        run = db.active_model_run(outlet_id)
        assert run is not None
    model, meta = registry.load(outlet_id, run["version"])
    return model, meta, run["version"]


def _future_frame(outlet: dict[str, Any], meta: dict[str, Any], dates: list[date]) -> pd.DataFrame:
    sales = db.daily_sales(outlet["id"])
    dishes = db.dishes(outlet["id"], active_only=True)
    if dishes.empty:
        return pd.DataFrame()
    end = max(dates)
    hist_start = date.fromisoformat(str(sales["date"].min())) if len(sales) else end - timedelta(days=35)
    external = ensure_external_days(outlet, max(hist_start, end - timedelta(days=60)), end)
    frame = build_frame(sales, dishes, external, end, meta["dish_codes"], meta["category_codes"])
    wanted = {d.isoformat() for d in dates}
    return frame[frame["date_str"].isin(wanted)].copy()


def _predict_rows(model: ForecastModel, rows: pd.DataFrame) -> pd.DataFrame:
    pred = model.predict(rows)
    out = rows[["dish_id", "dish_name", "date_str"]].copy()
    out[["low", "likely", "high"]] = pred[["low", "likely", "high"]].to_numpy()
    out["explanation"] = [
        explain(r, p.low, p.likely, p.high) for (_, r), p in zip(rows.iterrows(), pred.itertuples())
    ]
    return out


def forecast_outlet(outlet_id: str, start: date | None = None, days: int | None = None, persist: bool = True) -> list[dict[str, Any]]:
    outlet = db.outlet(outlet_id)
    if not outlet:
        raise ValueError(f"outlet {outlet_id} not found")
    model, meta, version = _load_active(outlet_id)
    start = start or (date.today() + timedelta(days=1))
    days = days or settings.horizon_days
    dates = [start + timedelta(days=i) for i in range(days)]

    rows = _future_frame(outlet, meta, dates)
    if rows.empty:
        return []
    pred = _predict_rows(model, rows)
    result = [
        {
            "outletId": outlet_id,
            "dishId": r.dish_id,
            "dishName": r.dish_name,
            "date": r.date_str,
            "low": float(r.low),
            "likely": float(r.likely),
            "high": float(r.high),
            "modelVersion": version,
            "explanation": r.explanation,
        }
        for r in pred.itertuples()
    ]
    if persist:
        db.upsert_forecasts([{k: v for k, v in r.items() if k != "dishName"} for r in result])
    return result


# ------------------------------------------------------------------ what-if

SCENARIO_KEYS = ("rainMm", "tempMax", "isHoliday", "discountPct", "promo")


def apply_scenario(rows: pd.DataFrame, scenario: dict[str, Any]) -> pd.DataFrame:
    rows = rows.copy()
    if scenario.get("rainMm") is not None:
        rows["rain_mm"] = float(scenario["rainMm"])
    if scenario.get("tempMax") is not None:
        rows["temp_max"] = float(scenario["tempMax"])
        rows["temp_min"] = rows["temp_min"].fillna(rows["temp_max"] - 8)
    if scenario.get("isHoliday") is not None:
        rows["is_holiday"] = int(bool(scenario["isHoliday"]))
        if scenario["isHoliday"]:
            rows["days_to_holiday"] = 0
            rows["days_from_holiday"] = 0
            rows["holiday_name"] = "a holiday (what-if)"
    discount = float(scenario.get("discountPct") or 0)
    if discount > 0 or scenario.get("promo"):
        rows["promo"] = 1
        rows["price"] = rows["list_price"] * (1 - discount / 100)
    dish_ids = scenario.get("dishIds")
    if dish_ids:
        rows = rows[rows["dish_id"].isin(list(dish_ids))]
    return rows


def what_if(outlet_id: str, day: date, scenario: dict[str, Any]) -> dict[str, Any]:
    outlet = db.outlet(outlet_id)
    if not outlet:
        raise ValueError(f"outlet {outlet_id} not found")
    model, meta, version = _load_active(outlet_id)
    rows = _future_frame(outlet, meta, [day])
    if rows.empty:
        return {"date": day.isoformat(), "modelVersion": version, "baseline": [], "scenario": []}
    costs = db.dish_costs(outlet_id).set_index("dish_id")["cost_per_plate"]

    def pack(pred: pd.DataFrame, src: pd.DataFrame) -> list[dict[str, Any]]:
        out = []
        for r, (_, s) in zip(pred.itertuples(), src.iterrows()):
            out.append({
                "dishId": r.dish_id,
                "dishName": r.dish_name,
                "low": float(r.low), "likely": float(r.likely), "high": float(r.high),
                "price": float(s["price"]),
                "costPerPlate": float(costs.get(r.dish_id, 0.0)),
                "explanation": r.explanation,
            })
        return out

    base_rows = apply_scenario(rows, {"dishIds": scenario.get("dishIds")})
    scen_rows = apply_scenario(rows, scenario)
    weather = base_rows.iloc[0]
    return {
        "date": day.isoformat(),
        "modelVersion": version,
        "assumed": {
            "rainMm": None if pd.isna(weather["rain_mm"]) else float(weather["rain_mm"]),
            "tempMax": None if pd.isna(weather["temp_max"]) else float(weather["temp_max"]),
            "isHoliday": bool(weather["is_holiday"]),
            "holidayName": weather.get("holiday_name") if isinstance(weather.get("holiday_name"), str) else None,
            "isWeekend": bool(weather["is_weekend"]),
        },
        "baseline": pack(_predict_rows(model, base_rows), base_rows),
        "scenario": pack(_predict_rows(model, scen_rows), scen_rows),
    }
