"""Module K (anomaly scan → alerts) and module I (menu engineering) endpoints."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import db
from app.ml.anomaly import scan_outlet
from app.ml.menu_engineering import analyse

router = APIRouter(prefix="/api")


class ScanRequest(BaseModel):
    outletId: str | None = Field(default=None, description="All outlets when omitted")
    days: int = Field(default=14, ge=1, le=90)


def _write_alerts(outlet_id: str, flags: list[dict]) -> int:
    """Insert one `anomaly` alert per dish-day, skipping ones already stored."""
    if not flags:
        return 0
    existing = db.fetch_all(
        'SELECT "dataJson" FROM "Alert" WHERE "outletId" = :o AND type = :t',
        {"o": outlet_id, "t": "anomaly"},
    )
    seen = set()
    for row in existing:
        try:
            d = json.loads(row["dataJson"] or "{}")
            seen.add((d.get("dishId"), d.get("date")))
        except ValueError:
            continue
    rows = []
    now = db.now_value()
    for f in flags:
        if (f["dishId"], f["date"]) in seen:
            continue
        rows.append({
            "id": db.new_id(), "o": outlet_id, "type": "anomaly", "sev": "warning", "msg": f["reason"],
            "data": json.dumps({"dishId": f["dishId"], "date": f["date"], "qty": f["qty"], "expected": f["expected"], "zscore": f["zscore"]}),
            "c": now,
        })
    if rows:
        db.execute(
            'INSERT INTO "Alert" (id, "outletId", type, severity, message, "dataJson", "isRead", "createdAt") '
            "VALUES (:id, :o, :type, :sev, :msg, :data, :read, :c)",
            [{**r, "read": False} for r in rows],
        )
    return len(rows)


@router.post("/anomaly/scan")
def anomaly_scan(req: ScanRequest) -> dict[str, Any]:
    targets = [req.outletId] if req.outletId else [o["id"] for o in db.all_outlets()]
    out: list[dict] = []
    created = 0
    for oid in targets:
        if not db.outlet(oid):
            raise HTTPException(status_code=404, detail=f"outlet {oid} not found")
        flags = scan_outlet(oid, req.days)
        created += _write_alerts(oid, flags)
        out.extend({**f, "outletId": oid} for f in flags)
    return {"flagged": out, "alertsCreated": created, "days": req.days}


@router.get("/menu-engineering/{outlet_id}")
def menu_engineering(outlet_id: str, days: int = 28) -> dict[str, Any]:
    if not db.outlet(outlet_id):
        raise HTTPException(status_code=404, detail=f"outlet {outlet_id} not found")
    return analyse(outlet_id, days)

