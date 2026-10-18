"""Weather per outlet city and day.

Future days come from Open-Meteo (free, no API key). When the network is
unavailable, or for days Open-Meteo cannot cover, a monthly climatology for
coastal western India is used so forecasts never fail for lack of weather.
Every row remembers its source so the admin panel can tell them apart.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import httpx
import pandas as pd

from app import db
from app.config import settings
from app.external.holidays import holiday_map

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = "temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean"
# Used when an outlet has no coordinates yet (Module A creates outlets with city only).
DEFAULT_LAT, DEFAULT_LON = 19.0760, 72.8777

# (temp_max, temp_min, rain_mm per day, humidity) by month, Mumbai-like climate.
CLIMATOLOGY = {
    1: (31, 18, 0.0, 60), 2: (32, 19, 0.0, 60), 3: (33, 22, 0.0, 65),
    4: (33, 25, 0.1, 70), 5: (34, 27, 0.5, 72), 6: (32, 26, 17.0, 82),
    7: (30, 25, 28.0, 88), 8: (30, 25, 18.0, 87), 9: (31, 25, 11.0, 83),
    10: (33, 24, 2.5, 72), 11: (33, 22, 0.5, 65), 12: (32, 19, 0.1, 60),
}


def climatology_row(day: date) -> dict[str, Any]:
    t_max, t_min, rain, hum = CLIMATOLOGY[day.month]
    return {"tempMax": float(t_max), "tempMin": float(t_min), "rainMm": float(rain),
            "humidity": float(hum), "source": "climatology"}


def _parse_daily(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    daily = payload.get("daily", {})
    out: dict[str, dict[str, Any]] = {}
    for i, d in enumerate(daily.get("time", [])):
        def pick(key: str) -> float | None:
            vals = daily.get(key)
            if not vals or i >= len(vals) or vals[i] is None:
                return None
            return float(vals[i])
        out[d] = {
            "tempMax": pick("temperature_2m_max"),
            "tempMin": pick("temperature_2m_min"),
            "rainMm": pick("precipitation_sum"),
            "humidity": pick("relative_humidity_2m_mean"),
            "source": "open-meteo",
        }
    return out


def fetch_open_meteo(lat: float, lon: float, start: date, end: date) -> dict[str, dict[str, Any]]:
    """Daily weather for [start, end]; past days from the archive, future from the forecast."""
    if not settings.use_open_meteo:
        return {}
    today = date.today()
    results: dict[str, dict[str, Any]] = {}
    try:
        with httpx.Client(timeout=10) as client:
            if start < today:
                r = client.get(ARCHIVE_URL, params={
                    "latitude": lat, "longitude": lon, "daily": DAILY_VARS, "timezone": "auto",
                    "start_date": start.isoformat(), "end_date": min(end, today - timedelta(days=1)).isoformat(),
                })
                if r.status_code == 200:
                    results.update(_parse_daily(r.json()))
            if end >= today:
                days = min((end - today).days + 1, 16)
                r = client.get(FORECAST_URL, params={
                    "latitude": lat, "longitude": lon, "daily": DAILY_VARS, "timezone": "auto",
                    "forecast_days": days,
                })
                if r.status_code == 200:
                    results.update(_parse_daily(r.json()))
                else:
                    log.warning("open-meteo forecast returned %s: %s", r.status_code, r.text[:200])
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("open-meteo unavailable, using climatology: %s", exc)
    return results


def ensure_external_days(outlet: dict[str, Any], start: date, end: date, refresh_future: bool = True) -> pd.DataFrame:
    """Make sure ExternalDay has a row for every day in [start, end] for this city.

    Existing rows are kept unless they are climatology/synthetic for a future
    day and a real forecast is now available.
    """
    city = outlet["city"]
    existing = db.external_days(city, start.isoformat(), end.isoformat())
    have = {row["date"]: row for row in existing.to_dict("records")} if len(existing) else {}
    today = date.today()
    hols = holiday_map(start, end)

    missing = [start + timedelta(days=i) for i in range((end - start).days + 1)
               if (d := (start + timedelta(days=i)).isoformat()) not in have
               or (refresh_future and start + timedelta(days=i) >= today and have[d]["source"] != "open-meteo")]
    if not missing:
        return existing

    lat = outlet.get("latitude") if outlet.get("latitude") is not None else DEFAULT_LAT
    lon = outlet.get("longitude") if outlet.get("longitude") is not None else DEFAULT_LON
    fetched = fetch_open_meteo(lat, lon, min(missing), max(missing))
    rows = []
    for day in missing:
        iso = day.isoformat()
        base = fetched.get(iso) or climatology_row(day)
        rows.append({**base, "city": city, "date": iso,
                     "isHoliday": iso in hols, "holidayName": hols.get(iso)})
    db.upsert_external_days(rows)
    return db.external_days(city, start.isoformat(), end.isoformat())
