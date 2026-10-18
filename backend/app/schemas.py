"""Request/response contracts between Next.js and the ML service."""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class TrainRequest(BaseModel):
    outletId: str
    promote: bool = True


class ForecastRunRequest(BaseModel):
    outletId: str | None = Field(default=None, description="All outlets when omitted")
    startDate: date | None = Field(default=None, description="Defaults to tomorrow")
    days: int = Field(default=7, ge=1, le=14)


class ForecastRow(BaseModel):
    outletId: str
    dishId: str
    dishName: str | None = None
    date: str
    low: float
    likely: float
    high: float
    modelVersion: str
    explanation: str


class Scenario(BaseModel):
    rainMm: float | None = Field(default=None, ge=0, le=300)
    tempMax: float | None = Field(default=None, ge=0, le=50)
    isHoliday: bool | None = None
    discountPct: float | None = Field(default=None, ge=0, le=90)
    promo: bool | None = None
    dishIds: list[str] | None = None


class WhatIfRequest(BaseModel):
    outletId: str
    date: date
    scenario: Scenario = Field(default_factory=Scenario)


class WhatIfDish(BaseModel):
    dishId: str
    dishName: str
    low: float
    likely: float
    high: float
    price: float
    costPerPlate: float
    explanation: str


class WhatIfResponse(BaseModel):
    date: str
    modelVersion: str
    assumed: dict[str, Any]
    baseline: list[WhatIfDish]
    scenario: list[WhatIfDish]
