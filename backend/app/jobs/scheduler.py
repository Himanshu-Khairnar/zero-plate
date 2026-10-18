"""In-process scheduler for hosts without cron (Render/Railway background worker).

    python -m app.jobs.scheduler

Runs the nightly forecast at 02:00 and the weekly retrain on Monday at 03:00
(server local time). On a box with real cron, use deploy/crontab instead.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime

from app.jobs import nightly_forecast, weekly_retrain

log = logging.getLogger("scheduler")

NIGHTLY_HOUR = 2
RETRAIN_WEEKDAY, RETRAIN_HOUR = 0, 3  # Monday 03:00


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    last_nightly: str | None = None
    last_retrain: str | None = None
    log.info("scheduler started")
    while True:
        now = datetime.now()
        day = now.strftime("%Y-%m-%d")
        if now.hour == NIGHTLY_HOUR and last_nightly != day:
            last_nightly = day
            log.info("running nightly forecast")
            nightly_forecast.run()
        if now.weekday() == RETRAIN_WEEKDAY and now.hour == RETRAIN_HOUR and last_retrain != day:
            last_retrain = day
            log.info("running weekly retrain")
            weekly_retrain.run()
            nightly_forecast.run()  # refresh forecasts with the newly promoted model
        time.sleep(60)


if __name__ == "__main__":
    main()
