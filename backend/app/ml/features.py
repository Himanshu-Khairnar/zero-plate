"""Feature engineering for dish-level demand forecasting.

One row = one dish on one day. The same builder is used for training rows
(where the target `qty` is known) and for future rows (where it is NaN), so
train and serve can never drift apart.

Lag features are *horizon safe*: for a forecast made tonight for any of the
next 7 days, every lag used (7, 14, 21, 28 days) is already in the past. The
plan mentions a 1-day lag; that is only available for tomorrow, so it is
replaced by the 7-day rolling mean ending yesterday-of-last-week.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.external.holidays import holiday_map

CAL_COLS = ["dow", "dom", "month", "is_weekend", "is_holiday", "days_to_holiday",
            "days_from_holiday", "is_payday"]
WEATHER_COLS = ["temp_max", "temp_min", "rain_mm", "humidity"]
LAG_COLS = ["lag_7", "lag_14", "lag_21", "lag_28", "lag_mean4", "roll7_mean", "roll7_std",
            "roll28_mean", "roll28_std", "trend_ratio"]
DISH_COLS = ["dish_code", "category_code", "price", "promo", "days_since_launch"]
FEATURES = CAL_COLS + WEATHER_COLS + LAG_COLS + DISH_COLS
CATEGORICAL = ["dish_code", "category_code", "dow"]

HOLIDAY_WINDOW = 30
PROMO_THRESHOLD = 0.95  # a sale below 95% of list price counts as a promotion


def calendar_frame(dates: pd.DatetimeIndex) -> pd.DataFrame:
    start, end = dates.min().date(), dates.max().date()
    hols = holiday_map(start - timedelta(days=HOLIDAY_WINDOW), end + timedelta(days=HOLIDAY_WINDOW))
    hol_days = np.array(sorted(pd.to_datetime(list(hols.keys())))) if hols else np.array([], dtype="datetime64[ns]")

    df = pd.DataFrame(index=dates)
    df["dow"] = dates.dayofweek
    df["dom"] = dates.day
    df["month"] = dates.month
    df["is_weekend"] = (dates.dayofweek >= 5).astype(int)
    df["is_holiday"] = [int(d.strftime("%Y-%m-%d") in hols) for d in dates]
    df["holiday_name"] = [hols.get(d.strftime("%Y-%m-%d")) for d in dates]
    df["is_payday"] = ((dates.day <= 2) | (dates.day >= 29)).astype(int)

    if len(hol_days):
        vals = dates.values.astype("datetime64[D]")
        hd = hol_days.astype("datetime64[D]")
        idx_next = np.searchsorted(hd, vals, side="left")
        idx_prev = idx_next - 1
        to_next = np.where(idx_next < len(hd), (hd[np.minimum(idx_next, len(hd) - 1)] - vals).astype(int), HOLIDAY_WINDOW)
        from_prev = np.where(idx_prev >= 0, (vals - hd[np.maximum(idx_prev, 0)]).astype(int), HOLIDAY_WINDOW)
        df["days_to_holiday"] = np.clip(to_next, 0, HOLIDAY_WINDOW)
        df["days_from_holiday"] = np.clip(from_prev, 0, HOLIDAY_WINDOW)
    else:
        df["days_to_holiday"] = HOLIDAY_WINDOW
        df["days_from_holiday"] = HOLIDAY_WINDOW
    return df


def _weather_frame(external: pd.DataFrame | None, dates: pd.DatetimeIndex) -> pd.DataFrame:
    df = pd.DataFrame(index=dates, columns=WEATHER_COLS, dtype=float)
    if external is not None and len(external):
        ext = external.copy()
        ext["date"] = pd.to_datetime(ext["date"])
        ext = ext.drop_duplicates("date").set_index("date")
        for src, dst in [("tempMax", "temp_max"), ("tempMin", "temp_min"),
                         ("rainMm", "rain_mm"), ("humidity", "humidity")]:
            if src in ext:
                df[dst] = ext[src].reindex(dates).astype(float)
    return df


def build_frame(
    sales: pd.DataFrame,
    dishes: pd.DataFrame,
    external: pd.DataFrame | None,
    end_date: date,
    dish_codes: dict[str, int] | None = None,
    category_codes: dict[str, int] | None = None,
) -> pd.DataFrame:
    """Rows for every dish in `dishes` for every day up to `end_date`.

    `sales` has columns dish_id, date (ISO), qty, price. Days without a sale
    row count as zero sales. Days after the last sale row have qty NaN; those
    are the rows we forecast.
    """
    dishes = dishes.reset_index(drop=True)
    dish_ids = list(dishes["id"])
    if len(sales):
        first = pd.to_datetime(sales["date"]).min()
        last_sale = pd.to_datetime(sales["date"]).max()
    else:
        first = pd.Timestamp(end_date) - pd.Timedelta(days=35)
        last_sale = first - pd.Timedelta(days=1)
    dates = pd.date_range(first, pd.Timestamp(end_date), freq="D")

    sales = sales[sales["dish_id"].isin(dish_ids)].copy()
    sales["date"] = pd.to_datetime(sales["date"])
    qty = sales.pivot_table(index="date", columns="dish_id", values="qty", aggfunc="sum")
    qty = qty.reindex(index=dates, columns=dish_ids)
    known = qty.index <= last_sale
    qty.loc[known] = qty.loc[known].fillna(0.0)

    price = sales.pivot_table(index="date", columns="dish_id", values="price", aggfunc="mean")
    price = price.reindex(index=dates, columns=dish_ids)
    list_price = dishes.set_index("id")["price"].astype(float)
    price = price.fillna(list_price)  # future days and silent days at list price

    lag = {f"lag_{k}": qty.shift(k) for k in (7, 14, 21, 28)}
    lag["roll7_mean"] = qty.rolling(7, min_periods=3).mean().shift(7)
    lag["roll7_std"] = qty.rolling(7, min_periods=3).std().shift(7)
    lag["roll28_mean"] = qty.rolling(28, min_periods=7).mean().shift(7)
    lag["roll28_std"] = qty.rolling(28, min_periods=7).std().shift(7)
    # Same-weekday average of the last four weeks (what the seasonal baseline uses)
    # and a short-vs-long trend ratio; both help the trees learn levels quickly.
    lag["lag_mean4"] = sum(qty.shift(k) for k in (7, 14, 21, 28)) / 4
    lag["trend_ratio"] = lag["roll7_mean"] / lag["roll28_mean"].where(lag["roll28_mean"] > 0)

    cal = calendar_frame(dates)
    wx = _weather_frame(external, dates)

    long = qty.stack(future_stack=True).rename("qty").reset_index()
    long.columns = ["date", "dish_id", "qty"]
    long["price"] = price.stack(future_stack=True).values
    for name, mat in lag.items():
        long[name] = mat.stack(future_stack=True).values
    long = long.merge(cal, left_on="date", right_index=True, how="left")
    long = long.merge(wx, left_on="date", right_index=True, how="left")

    meta = dishes.set_index("id")
    long["category"] = long["dish_id"].map(meta["category"])
    long["dish_name"] = long["dish_id"].map(meta["name"])
    long["list_price"] = long["dish_id"].map(list_price)
    long["promo"] = (long["price"] < PROMO_THRESHOLD * long["list_price"]).astype(int)
    launched = pd.to_datetime(meta["launchedAt"]) if "launchedAt" in meta else pd.Series(dtype="datetime64[ns]")
    long["days_since_launch"] = (long["date"] - long["dish_id"].map(launched)).dt.days.astype(float)

    dish_codes = dish_codes or {d: i for i, d in enumerate(dish_ids)}
    category_codes = category_codes or {c: i for i, c in enumerate(sorted(meta["category"].unique()))}
    long["dish_code"] = long["dish_id"].map(dish_codes).fillna(-1).astype(int)
    long["category_code"] = long["category"].map(category_codes).fillna(-1).astype(int)
    long["is_future"] = long["date"] > last_sale
    long["date_str"] = long["date"].dt.strftime("%Y-%m-%d")
    return long.sort_values(["date", "dish_id"]).reset_index(drop=True)


def training_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Rows with a known target and at least one lag available."""
    return frame[(~frame["is_future"]) & frame["lag_7"].notna()].copy()
