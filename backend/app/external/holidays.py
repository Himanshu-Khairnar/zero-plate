"""Public holidays per day, used both for training features and for forecasts."""

from __future__ import annotations

from datetime import date
from functools import lru_cache

import holidays as holidays_lib

from app.config import settings


@lru_cache(maxsize=16)
def _calendar(country: str, years: tuple[int, ...]) -> dict[date, str]:
    try:
        cal = holidays_lib.country_holidays(country, subdiv="MH", years=list(years))
    except Exception:  # subdivision not known for this country
        cal = holidays_lib.country_holidays(country, years=list(years))
    return {d: str(name) for d, name in cal.items()}


def holiday_map(start: date, end: date, country: str | None = None) -> dict[str, str]:
    """Map of ISO date -> holiday name for every holiday in [start, end]."""
    years = tuple(range(start.year, end.year + 1))
    cal = _calendar(country or settings.holiday_country, years)
    return {d.isoformat(): name for d, name in cal.items() if start <= d <= end}
