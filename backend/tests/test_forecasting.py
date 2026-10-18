"""Unit tests for the forecasting slice. Run with: pytest -q (from backend/)."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app.data.synthetic import DISHES, generate
from app.ml.backtest import metrics, pick_winner, rolling_backtest
from app.ml.explain import explain
from app.ml.features import FEATURES, build_frame, training_rows
from app.ml.models import LightGBMPoisson, NaiveLastWeek, SeasonalNaive


@pytest.fixture(scope="module")
def demo():
    end = date(2026, 10, 17)
    start = end - timedelta(days=16 * 7 - 1)
    weather, sales, hols = generate(start, end, seed=3)
    dishes = pd.DataFrame(
        [{"id": f"d{i}", "name": s.name, "category": s.category, "price": s.price, "launchedAt": start.isoformat()}
         for i, s in enumerate(DISHES)]
    )
    name_to_id = dict(zip(dishes["name"], dishes["id"]))
    daily = (
        pd.DataFrame(sales)
        .assign(dish_id=lambda d: d["dish"].map(name_to_id))
        .groupby(["dish_id", "date"], as_index=False)
        .agg(qty=("qtySold", "sum"), price=("price", "mean"))
    )
    external = pd.DataFrame([{**wx, "city": "Vasai", "date": iso, "isHoliday": iso in hols} for iso, wx in weather.items()])
    return daily, dishes, external, end


def test_frame_has_every_feature_and_is_horizon_safe(demo):
    daily, dishes, external, end = demo
    frame = build_frame(daily, dishes, external, end + timedelta(days=7))
    assert set(FEATURES) <= set(frame.columns)
    future = frame[frame["is_future"]]
    assert future["date_str"].nunique() == 7
    # Every lag used for the 7 future days must come from known history.
    assert future[["lag_7", "lag_14", "lag_21", "lag_28"]].notna().all().all()
    assert future["qty"].isna().all()
    rows = training_rows(frame)
    assert rows["qty"].notna().all() and len(rows) > 1000


def test_lightgbm_beats_naive_on_backtest(demo):
    daily, dishes, external, end = demo
    rows = training_rows(build_frame(daily, dishes, external, end))
    naive = rolling_backtest(NaiveLastWeek(), rows, folds=3)["overall"]
    lgbm = rolling_backtest(LightGBMPoisson(), rows, folds=3)["overall"]
    assert lgbm["mae"] < naive["mae"]
    assert 0.6 <= lgbm["coverage"] <= 0.98
    assert pick_winner([{"model": "naive", "overall": naive}, {"model": "lightgbm", "overall": lgbm}]) == "lightgbm"


def test_predictions_are_ordered_and_non_negative(demo):
    daily, dishes, external, end = demo
    frame = build_frame(daily, dishes, external, end + timedelta(days=7))
    rows, future = training_rows(frame), frame[frame["is_future"]]
    for model in (NaiveLastWeek(), SeasonalNaive(), LightGBMPoisson()):
        pred = model.fit(rows).predict(future)
        assert (pred["low"] <= pred["likely"]).all() and (pred["likely"] <= pred["high"]).all()
        assert (pred["low"] >= 0).all()
        assert len(pred) == len(future)


def test_rain_lowers_demand_for_rain_sensitive_dish(demo):
    daily, dishes, external, end = demo
    frame = build_frame(daily, dishes, external, end + timedelta(days=1))
    rows, future = training_rows(frame), frame[frame["is_future"]].copy()
    model = LightGBMPoisson().fit(rows)
    thali = future[future["dish_name"] == "Veg Thali"]
    dry, wet = thali.copy(), thali.copy()
    dry["rain_mm"], wet["rain_mm"] = 0.0, 60.0
    assert model.predict(wet)["likely"].iloc[0] < model.predict(dry)["likely"].iloc[0]


def test_metrics_and_explanations():
    actual = pd.Series([10, 20, 30])
    pred = pd.DataFrame({"low": [5, 15, 25], "likely": [12, 18, 30], "high": [15, 25, 35]})
    m = metrics(actual, pred)
    assert m["mae"] == pytest.approx(4 / 3, abs=1e-3)
    assert m["coverage"] == 1.0
    row = pd.Series({"is_holiday": 1, "holiday_name": "Diwali", "is_weekend": 0, "dow": 2, "rain_mm": 12.0,
                     "temp_max": 31.0, "promo": 0, "is_payday": 0, "roll7_mean": 40, "roll28_mean": 40,
                     "days_to_holiday": 0})
    text = explain(row, 48, 60, 72)
    assert "Higher than usual" in text and "Diwali" in text and "heavy rain" in text
    assert "60 plates" in text


def test_synthetic_generator_is_deterministic():
    a = generate(date(2026, 1, 1), date(2026, 1, 31), seed=1)
    b = generate(date(2026, 1, 1), date(2026, 1, 31), seed=1)
    assert a[1] == b[1]
    assert np.isclose(sum(r["qtySold"] for r in a[1]), sum(r["qtySold"] for r in b[1]))
