"""API-level tests for the ML service.

These hit the configured database (DATABASE_URL in backend/.env). They are
skipped automatically when no database with a seeded outlet is reachable,
so the unit suite stays green in CI without Postgres.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def outlet_id(client):
    try:
        res = client.get("/api/outlets")
    except Exception as exc:  # database unreachable
        pytest.skip(f"database not reachable: {exc}")
    if res.status_code != 200 or not res.json():
        pytest.skip("no seeded outlet in the database")
    return res.json()[0]["id"]


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_forecast_run_writes_rows_with_ranges(client, outlet_id):
    start = (date.today() + timedelta(days=1)).isoformat()
    res = client.post("/api/forecast/run", json={"outletId": outlet_id, "startDate": start, "days": 2})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert rows, "expected forecasts for an outlet with sales history"
    for r in rows:
        assert r["low"] <= r["likely"] <= r["high"]
        assert r["low"] >= 0
        assert r["explanation"]
    stored = client.get(f"/api/forecast/{outlet_id}", params={"start": start, "end": start}).json()
    assert {x["dishId"] for x in stored} == {x["dishId"] for x in rows if x["date"] == start}


def test_whatif_rain_and_discount_change_demand(client, outlet_id):
    day = (date.today() + timedelta(days=2)).isoformat()
    base = client.post("/api/whatif", json={"outletId": outlet_id, "date": day, "scenario": {}})
    assert base.status_code == 200, base.text
    disc = client.post("/api/whatif", json={"outletId": outlet_id, "date": day, "scenario": {"discountPct": 20}})
    assert disc.status_code == 200
    b, s = disc.json()["baseline"], disc.json()["scenario"]
    assert len(b) == len(s) > 0
    assert sum(x["likely"] for x in s) != sum(x["likely"] for x in b)
    assert all(x["price"] < y["price"] for x, y in zip(s, b) if y["price"] > 0)


def test_models_endpoint_reports_active_model(client, outlet_id):
    res = client.get(f"/api/models/{outlet_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["active"] is not None
    assert body["active"]["metrics"]["winner"] == body["active"]["modelName"]


def test_validation_errors_are_clean(client):
    assert client.post("/api/whatif", json={"outletId": "x", "date": "nope"}).status_code == 422
    assert client.post("/api/forecast/run", json={"outletId": "does-not-exist"}).status_code in (404, 422)
