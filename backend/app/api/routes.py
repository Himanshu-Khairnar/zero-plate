from __future__ import annotations

import json
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import db
from app.ml import registry
from app.ml.predict import forecast_outlet, what_if
from app.ml.train import NotEnoughData, train_outlet
from app.schemas import ForecastRow, ForecastRunRequest, TrainRequest, WhatIfRequest, WhatIfResponse

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "database": db.engine().dialect.name}


@router.get("/outlets")
def outlets() -> list[dict[str, Any]]:
    return db.all_outlets()


# --------------------------------------------------------------- training


@router.post("/train")
def train(req: TrainRequest) -> dict[str, Any]:
    try:
        return train_outlet(req.outletId, promote=req.promote)
    except NotEnoughData as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/models/{outlet_id}")
def models(outlet_id: str) -> dict[str, Any]:
    runs = db.model_runs(outlet_id)
    for r in runs:
        try:
            r["metrics"] = json.loads(r.pop("metricsJson"))
        except (TypeError, ValueError):
            r["metrics"] = None
        r["artifactPresent"] = registry.exists(outlet_id, r["version"])
    return {"outletId": outlet_id, "active": next((r for r in runs if r["isActive"]), None), "runs": runs}


# ------------------------------------------------------------- forecasting


@router.post("/forecast/run", response_model=list[ForecastRow])
def forecast_run(req: ForecastRunRequest) -> list[dict[str, Any]]:
    targets = [req.outletId] if req.outletId else [o["id"] for o in db.all_outlets()]
    out: list[dict[str, Any]] = []
    for oid in targets:
        try:
            out.extend(forecast_outlet(oid, req.startDate, req.days, persist=True))
        except NotEnoughData as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    return out


@router.get("/forecast/{outlet_id}")
def forecast_read(
    outlet_id: str,
    start: date = Query(default=None),
    end: date = Query(default=None),
) -> list[dict[str, Any]]:
    """Stored forecasts (what the nightly job wrote), no model call."""
    params: dict[str, Any] = {"o": outlet_id}
    sql = 'SELECT f.*, d.name AS "dishName" FROM "Forecast" f JOIN "Dish" d ON d.id = f."dishId" WHERE f."outletId" = :o'
    if start:
        sql += " AND f.date >= :s"
        params["s"] = start.isoformat()
    if end:
        sql += " AND f.date <= :e"
        params["e"] = end.isoformat()
    return db.fetch_all(sql + " ORDER BY f.date, d.name", params)


@router.post("/whatif", response_model=WhatIfResponse)
def whatif(req: WhatIfRequest) -> dict[str, Any]:
    try:
        return what_if(req.outletId, req.date, req.scenario.model_dump(exclude_none=True))
    except NotEnoughData as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
