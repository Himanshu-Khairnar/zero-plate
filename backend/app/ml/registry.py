"""Versioned model artifacts on disk: models/<outletId>/<version>/."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib

from app.config import settings
from app.ml.models import ForecastModel


def new_version() -> str:
    return datetime.now(timezone.utc).strftime("v%Y%m%d-%H%M%S")


def _dir(outlet_id: str, version: str) -> Path:
    return settings.model_dir / outlet_id / version


def save(outlet_id: str, version: str, model: ForecastModel, meta: dict[str, Any]) -> Path:
    d = _dir(outlet_id, version)
    d.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, d / "model.joblib")
    (d / "meta.json").write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")
    return d


def load(outlet_id: str, version: str) -> tuple[ForecastModel, dict[str, Any]]:
    d = _dir(outlet_id, version)
    model = joblib.load(d / "model.joblib")
    meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    return model, meta


def exists(outlet_id: str, version: str) -> bool:
    return (_dir(outlet_id, version) / "model.joblib").exists()


def versions(outlet_id: str) -> list[str]:
    base = settings.model_dir / outlet_id
    if not base.exists():
        return []
    return sorted(p.name for p in base.iterdir() if (p / "model.joblib").exists())
