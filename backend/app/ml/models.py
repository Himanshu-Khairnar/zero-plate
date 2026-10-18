"""Candidate forecasting models behind one small interface.

Every model takes the feature frame from `features.build_frame` and returns a
DataFrame with columns low / likely / high (10th, 50th and 90th percentile).
The baselines exist so the plan's success metric, "better than same-day-last-
week", is measured on every training run rather than assumed.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.ml.features import CATEGORICAL, FEATURES

log = logging.getLogger(__name__)

def _tidy(pred: pd.DataFrame) -> pd.DataFrame:
    """Sort quantiles so low <= likely <= high and never go below zero."""
    arr = np.sort(pred[["low", "likely", "high"]].to_numpy(dtype=float), axis=1)
    arr = np.clip(arr, 0, None)
    out = pd.DataFrame(arr, columns=["low", "likely", "high"], index=pred.index)
    return out.round(2)


class ForecastModel:
    name = "base"

    def fit(self, frame: pd.DataFrame) -> "ForecastModel":
        raise NotImplementedError

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        raise NotImplementedError

    def info(self) -> dict[str, Any]:
        return {"name": self.name}


@dataclass
class _ResidualRange:
    """Prediction interval for the baselines from per-dish residual quantiles."""

    per_dish: dict[str, tuple[float, float]] = field(default_factory=dict)
    global_q: tuple[float, float] = (0.0, 0.0)

    def fit(self, dish_id: pd.Series, residual: pd.Series) -> None:
        res = pd.DataFrame({"dish": dish_id, "r": residual}).dropna()
        if res.empty:
            return
        self.global_q = (float(res["r"].quantile(0.10)), float(res["r"].quantile(0.90)))
        for d, grp in res.groupby("dish"):
            if len(grp) >= 10:
                self.per_dish[str(d)] = (float(grp["r"].quantile(0.10)), float(grp["r"].quantile(0.90)))

    def apply(self, dish_id: pd.Series, point: pd.Series) -> pd.DataFrame:
        lo = dish_id.map(lambda d: self.per_dish.get(str(d), self.global_q)[0]).astype(float)
        hi = dish_id.map(lambda d: self.per_dish.get(str(d), self.global_q)[1]).astype(float)
        return pd.DataFrame({"low": point + lo, "likely": point, "high": point + hi}, index=point.index)


class NaiveLastWeek(ForecastModel):
    """Same dish, same weekday, last week. The plan's reference baseline."""

    name = "naive"

    def __init__(self) -> None:
        self.range = _ResidualRange()

    @staticmethod
    def _point(frame: pd.DataFrame) -> pd.Series:
        return frame["lag_7"].fillna(frame["roll7_mean"]).fillna(0.0)

    def fit(self, frame: pd.DataFrame) -> "NaiveLastWeek":
        self.range.fit(frame["dish_id"], frame["qty"] - self._point(frame))
        return self

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        return _tidy(self.range.apply(frame["dish_id"], self._point(frame)))


class SeasonalNaive(ForecastModel):
    """Average of the same weekday over the last four weeks."""

    name = "seasonal_naive"

    def __init__(self) -> None:
        self.range = _ResidualRange()

    @staticmethod
    def _point(frame: pd.DataFrame) -> pd.Series:
        return frame[["lag_7", "lag_14", "lag_21", "lag_28"]].mean(axis=1).fillna(0.0)

    def fit(self, frame: pd.DataFrame) -> "SeasonalNaive":
        self.range.fit(frame["dish_id"], frame["qty"] - self._point(frame))
        return self

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        return _tidy(self.range.apply(frame["dish_id"], self._point(frame)))


class LightGBMPoisson(ForecastModel):
    """Gradient-boosted Poisson regression shared across all dishes.

    Dishes are a categorical feature so the model learns one global set of
    weather/calendar effects plus a per-dish level. That works with far less
    data than one model per dish and is the usual choice for retail demand.

    Plates sold are counts, so the Poisson objective (log link) is the natural
    fit: rain, holidays and promotions act multiplicatively on demand, and the
    log link learns exactly that. Quantile boosting was tried first and lost
    to the seasonal baseline on the backtest; Poisson beats it by ~10%.

    The low/high range is a Poisson-style interval widened by a dispersion
    factor estimated on a held-out tail of the training data (not in-sample,
    which would make the range overconfident).
    """

    name = "lightgbm"
    Z = 1.2816  # 10th / 90th percentile of the normal distribution
    HOLDOUT_DAYS = 14

    def __init__(self, n_estimators: int = 300, learning_rate: float = 0.03, num_leaves: int = 15) -> None:
        self.params = {
            "objective": "poisson",
            "n_estimators": n_estimators,
            "learning_rate": learning_rate,
            "num_leaves": num_leaves,
            "min_child_samples": 30,
            "subsample": 0.9,
            "subsample_freq": 1,
            "colsample_bytree": 0.9,
            "reg_lambda": 1.0,
            "verbose": -1,
            "random_state": 42,
        }
        self.model: Any = None
        self.dispersion: float = 1.0
        self.z: float = self.Z
        self.feature_importance: dict[str, float] = {}

    def _X(self, frame: pd.DataFrame) -> pd.DataFrame:
        X = frame[FEATURES].copy()
        for c in CATEGORICAL:
            X[c] = X[c].astype("category")
        return X

    def _fit_one(self, frame: pd.DataFrame) -> Any:
        import lightgbm as lgb

        m = lgb.LGBMRegressor(**self.params)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m.fit(self._X(frame), frame["qty"].astype(float), categorical_feature=CATEGORICAL)
        return m

    def fit(self, frame: pd.DataFrame) -> "LightGBMPoisson":
        cutoff = frame["date"].max() - pd.Timedelta(days=self.HOLDOUT_DAYS)
        head, tail = frame[frame["date"] <= cutoff], frame[frame["date"] > cutoff]
        if len(head) >= 100 and len(tail) >= 20:
            probe = self._fit_one(head)
            mu = np.clip(self._predict_point(probe, tail), 1.0, None)
            resid = tail["qty"].to_numpy(dtype=float) - mu
            # variance = dispersion * mean for an over-dispersed Poisson
            self.dispersion = float(max(np.mean(resid**2 / mu), 1.0))
            # Calibrate the range so 80% of held-out actuals fall inside it
            # (the plan's success metric), never narrower than the normal z.
            z80 = float(np.quantile(np.abs(resid) / np.sqrt(self.dispersion * mu), 0.80))
            self.z = max(z80, self.Z)
        self.model = self._fit_one(frame)
        imp = self.model.feature_importances_
        total = float(imp.sum()) or 1.0
        self.feature_importance = {f: round(float(v) / total, 4) for f, v in zip(FEATURES, imp)}
        return self

    def _predict_point(self, model: Any, frame: pd.DataFrame) -> np.ndarray:
        X = self._X(frame)
        # LightGBM remembers the category values per categorical column in
        # DataFrame column order; align to them so codes mean the same thing
        # at serving time as they did in training.
        train_cats = model.booster_.pandas_categorical
        if train_cats:
            cat_cols = [c for c in FEATURES if c in CATEGORICAL]
            for i, c in enumerate(cat_cols):
                X[c] = pd.Categorical(frame[c], categories=train_cats[i])
        return np.asarray(model.predict(X), dtype=float)

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        mu = np.clip(self._predict_point(self.model, frame), 0.0, None)
        sd = np.sqrt(self.dispersion * np.clip(mu, 1.0, None))
        out = pd.DataFrame({"low": mu - self.z * sd, "likely": mu, "high": mu + self.z * sd}, index=frame.index)
        return _tidy(out)

    def info(self) -> dict[str, Any]:
        return {"name": self.name, "params": self.params, "dispersion": round(self.dispersion, 3), "z": round(self.z, 3),
                "feature_importance": self.feature_importance}


class ProphetPerDish(ForecastModel):
    """Optional Prophet comparison; skipped automatically when not installed.

    Prophet needs one model per dish and a heavy dependency (cmdstan), so it
    is kept out of requirements.txt and only enters the comparison when
    `pip install prophet` has been done.
    """

    name = "prophet"

    def __init__(self) -> None:
        self.models: dict[str, Any] = {}

    @staticmethod
    def available() -> bool:
        try:
            import prophet  # noqa: F401
            return True
        except Exception:
            return False

    def fit(self, frame: pd.DataFrame) -> "ProphetPerDish":
        from prophet import Prophet

        for dish, grp in frame.groupby("dish_id"):
            ts = grp[["date", "qty"]].rename(columns={"date": "ds", "qty": "y"})
            if len(ts) < 14:
                continue
            m = Prophet(weekly_seasonality=True, yearly_seasonality=False, daily_seasonality=False,
                        interval_width=0.8)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                m.fit(ts)
            self.models[str(dish)] = m
        return self

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        out = pd.DataFrame(index=frame.index, columns=["low", "likely", "high"], dtype=float)
        for dish, grp in frame.groupby("dish_id"):
            m = self.models.get(str(dish))
            if m is None:
                out.loc[grp.index, ["low", "likely", "high"]] = 0.0
                continue
            fc = m.predict(grp[["date"]].rename(columns={"date": "ds"}))
            out.loc[grp.index, "low"] = fc["yhat_lower"].values
            out.loc[grp.index, "likely"] = fc["yhat"].values
            out.loc[grp.index, "high"] = fc["yhat_upper"].values
        return _tidy(out.fillna(0.0))


def candidate_models() -> list[ForecastModel]:
    models: list[ForecastModel] = [NaiveLastWeek(), SeasonalNaive(), LightGBMPoisson()]
    if ProphetPerDish.available():
        models.append(ProphetPerDish())
    return models


def make_model(name: str) -> ForecastModel:
    for m in candidate_models():
        if m.name == name:
            return m
    raise ValueError(f"unknown model {name}")
