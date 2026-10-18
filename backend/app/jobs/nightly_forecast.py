"""Nightly job: refresh weather and holidays, then forecast the next 7 days.

    python -m app.jobs.nightly_forecast
"""

from __future__ import annotations

import logging
import sys

from app import db
from app.ml.predict import forecast_outlet
from app.ml.train import NotEnoughData

log = logging.getLogger("nightly_forecast")


def run() -> int:
    failures = 0
    for outlet in db.all_outlets():
        try:
            rows = forecast_outlet(outlet["id"], persist=True)
            log.info("%s: wrote %d forecasts", outlet["name"], len(rows))
        except NotEnoughData as exc:
            log.warning("%s: skipped, %s", outlet["name"], exc)
        except Exception:
            failures += 1
            log.exception("%s: forecast failed", outlet["name"])
        # Module K: flag unusual sales days as alerts. Never block forecasting on it.
        try:
            from app.api.anomaly import _write_alerts
            from app.ml.anomaly import scan_outlet

            created = _write_alerts(outlet["id"], scan_outlet(outlet["id"], days=14))
            log.info("%s: anomaly scan created %d alerts", outlet["name"], created)
        except Exception:
            log.exception("%s: anomaly scan failed", outlet["name"])
    return failures


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sys.exit(1 if run() else 0)
