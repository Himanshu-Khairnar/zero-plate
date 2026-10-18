"""Synthetic sales for development and demos.

The plan assigns the team-wide synthetic generator to Nikhil (module B). This
is the forecasting slice's stand-in so training and the UI can be exercised
before any real café joins. The effects baked in (weekday pattern, rain,
heat, holidays, payday, promotions, a slow trend) are the ones the model is
expected to recover, which makes it a useful sanity check too.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np

from app.external.holidays import holiday_map
from app.external.weather import CLIMATOLOGY


@dataclass(frozen=True)
class DishSpec:
    name: str
    category: str
    price: float
    is_veg: bool
    base: float                         # average plates per day
    weekday: tuple[float, ...]          # Mon..Sun multipliers
    rain: float                         # multiplier applied on a rainy day
    heat: float                         # multiplier on a very hot day
    holiday: float                      # multiplier on a public holiday
    lunch_share: float = 0.55
    recipe: tuple[tuple[str, float], ...] = ()  # (ingredient, qty per plate)


INGREDIENTS: dict[str, tuple[str, float, int]] = {
    # name: (unit, cost per unit in INR, shelf life days)
    "Basmati rice": ("kg", 95.0, 180),
    "Wheat flour": ("kg", 42.0, 90),
    "Paneer": ("kg", 420.0, 3),
    "Chicken": ("kg", 260.0, 2),
    "Potato": ("kg", 28.0, 14),
    "Onion": ("kg", 32.0, 20),
    "Tomato": ("kg", 40.0, 5),
    "Cooking oil": ("l", 130.0, 180),
    "Butter": ("kg", 520.0, 30),
    "Milk": ("l", 62.0, 2),
    "Sugar": ("kg", 44.0, 365),
    "Chickpeas": ("kg", 110.0, 180),
    "Lentils (toor)": ("kg", 150.0, 180),
    "Spice mix": ("kg", 900.0, 120),
    "Pav bread": ("pcs", 4.0, 2),
    "Coffee powder": ("kg", 1100.0, 120),
    "Fresh cream": ("l", 240.0, 4),
    "Dosa batter": ("kg", 70.0, 2),
}

DISHES: list[DishSpec] = [
    DishSpec("Veg Thali", "Mains", 160, True, 48, (1.0, 1.0, 1.0, 1.0, 1.05, 0.8, 0.7), 0.85, 0.95, 0.8,
             recipe=(("Basmati rice", 0.12), ("Wheat flour", 0.08), ("Lentils (toor)", 0.05), ("Potato", 0.08),
                     ("Onion", 0.04), ("Tomato", 0.04), ("Cooking oil", 0.03), ("Spice mix", 0.01))),
    DishSpec("Paneer Butter Masala", "Mains", 240, True, 30, (0.85, 0.85, 0.9, 0.95, 1.15, 1.4, 1.35), 0.9, 0.95, 1.3,
             recipe=(("Paneer", 0.12), ("Butter", 0.03), ("Tomato", 0.1), ("Onion", 0.05), ("Fresh cream", 0.03),
                     ("Spice mix", 0.01))),
    DishSpec("Chicken Biryani", "Mains", 260, False, 36, (0.8, 0.8, 0.85, 0.9, 1.25, 1.5, 1.45), 0.9, 1.0, 1.35,
             recipe=(("Basmati rice", 0.15), ("Chicken", 0.18), ("Onion", 0.08), ("Cooking oil", 0.03),
                     ("Spice mix", 0.015))),
    DishSpec("Butter Chicken", "Mains", 280, False, 22, (0.8, 0.85, 0.9, 0.95, 1.2, 1.45, 1.4), 0.9, 0.95, 1.3,
             recipe=(("Chicken", 0.18), ("Butter", 0.03), ("Tomato", 0.1), ("Fresh cream", 0.04), ("Spice mix", 0.01))),
    DishSpec("Masala Dosa", "Breakfast", 110, True, 55, (1.1, 1.05, 1.05, 1.05, 1.0, 1.2, 1.3), 0.9, 1.0, 1.15,
             lunch_share=0.75, recipe=(("Dosa batter", 0.18), ("Potato", 0.1), ("Onion", 0.03), ("Cooking oil", 0.02))),
    DishSpec("Pav Bhaji", "Street", 120, True, 45, (0.95, 0.95, 1.0, 1.0, 1.1, 1.25, 1.2), 1.15, 0.9, 1.1,
             lunch_share=0.45, recipe=(("Pav bread", 2.0), ("Potato", 0.12), ("Tomato", 0.06), ("Onion", 0.05),
                                       ("Butter", 0.02), ("Spice mix", 0.008))),
    DishSpec("Vada Pav", "Street", 30, True, 140, (1.2, 1.2, 1.2, 1.15, 1.1, 0.75, 0.6), 1.1, 0.95, 0.7,
             lunch_share=0.6, recipe=(("Pav bread", 1.0), ("Potato", 0.08), ("Wheat flour", 0.02), ("Cooking oil", 0.015))),
    DishSpec("Dal Khichdi", "Mains", 130, True, 26, (1.1, 1.05, 1.05, 1.0, 0.95, 0.8, 0.85), 1.25, 0.9, 0.8,
             recipe=(("Basmati rice", 0.1), ("Lentils (toor)", 0.06), ("Butter", 0.015), ("Spice mix", 0.005))),
    DishSpec("Chole Bhature", "Mains", 150, True, 28, (0.9, 0.9, 0.95, 1.0, 1.1, 1.3, 1.35), 0.95, 0.9, 1.2,
             recipe=(("Chickpeas", 0.1), ("Wheat flour", 0.12), ("Onion", 0.04), ("Tomato", 0.04), ("Cooking oil", 0.05))),
    DishSpec("Veg Pulao", "Mains", 140, True, 24, (1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.05), 0.95, 1.0, 1.1,
             recipe=(("Basmati rice", 0.14), ("Onion", 0.04), ("Potato", 0.04), ("Cooking oil", 0.02), ("Spice mix", 0.006))),
    DishSpec("Filter Coffee", "Beverages", 60, True, 110, (1.15, 1.1, 1.1, 1.1, 1.05, 0.85, 0.75), 1.2, 0.75, 0.8,
             lunch_share=0.7, recipe=(("Coffee powder", 0.012), ("Milk", 0.12), ("Sugar", 0.012))),
    DishSpec("Gulab Jamun", "Desserts", 70, True, 40, (0.9, 0.9, 0.9, 0.95, 1.1, 1.35, 1.3), 1.0, 1.05, 1.4,
             recipe=(("Milk", 0.05), ("Sugar", 0.05), ("Wheat flour", 0.02), ("Cooking oil", 0.02))),
]


def synthetic_weather(days: list[date], rng: np.random.Generator) -> dict[str, dict[str, float]]:
    """Plausible Mumbai-coast weather with wet spells in the monsoon."""
    out: dict[str, dict[str, float]] = {}
    wet_spell = 0
    for d in days:
        t_max, t_min, rain_avg, hum = CLIMATOLOGY[d.month]
        if rain_avg >= 5:  # monsoon months: rain arrives in spells
            if wet_spell <= 0 and rng.random() < 0.35:
                wet_spell = int(rng.integers(1, 4))
            rain = float(rng.gamma(2.0, rain_avg / 1.5)) if wet_spell > 0 else float(rng.gamma(1.0, 1.5))
            wet_spell -= 1
        else:
            rain = float(rng.gamma(0.6, max(rain_avg, 0.05))) if rng.random() < 0.12 else 0.0
        tmax = t_max + rng.normal(0, 1.6) - (2.5 if rain > 8 else 0)
        out[d.isoformat()] = {
            "tempMax": round(float(tmax), 1),
            "tempMin": round(float(t_min + rng.normal(0, 1.2)), 1),
            "rainMm": round(rain, 1),
            "humidity": round(float(np.clip(hum + rng.normal(0, 5) + (6 if rain > 5 else 0), 30, 100)), 0),
        }
    return out


def generate(start: date, end: date, seed: int = 7) -> tuple[dict[str, dict[str, float]], list[dict], dict[str, str]]:
    """Return (weather by day, sales rows, holiday map).

    Sales rows: dish name, date, shift, qtySold, price.
    """
    rng = np.random.default_rng(seed)
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    weather = synthetic_weather(days, rng)
    hols = holiday_map(start, end)

    # Promotion days: about one in twenty, 15% off one random mains dish.
    promo_days: dict[str, str] = {}
    mains = [d.name for d in DISHES if d.category == "Mains"]
    for d in days:
        if rng.random() < 0.05:
            promo_days[d.isoformat()] = str(rng.choice(mains))

    rows: list[dict] = []
    n_days = len(days)
    for i, d in enumerate(days):
        iso = d.isoformat()
        wx = weather[iso]
        rainy = wx["rainMm"] >= 5
        very_hot = wx["tempMax"] >= 35
        holiday = iso in hols
        payday = d.day <= 2 or d.day >= 29
        trend = 1.0 + 0.12 * (i / max(n_days - 1, 1))   # business slowly growing
        day_noise = rng.normal(1.0, 0.06)                 # shared footfall shock

        for spec in DISHES:
            mu = spec.base * spec.weekday[d.weekday()] * trend * day_noise
            if rainy:
                mu *= spec.rain
            if very_hot:
                mu *= spec.heat
            if holiday:
                mu *= spec.holiday
            if payday:
                mu *= 1.08
            price = spec.price
            if promo_days.get(iso) == spec.name:
                mu *= 1.3
                price = round(spec.price * 0.85, 2)
            total = int(rng.poisson(max(mu, 0.5)))
            lunch = int(rng.binomial(total, spec.lunch_share)) if total else 0
            for shift, qty in (("lunch", lunch), ("dinner", total - lunch)):
                if qty > 0:
                    rows.append({"dish": spec.name, "date": iso, "shift": shift, "qtySold": qty, "price": price})
    return weather, rows, hols
