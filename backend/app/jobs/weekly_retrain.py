"""Weekly job: retrain every outlet, compare on the last 4 weeks, promote the winner.

    python -m app.jobs.weekly_retrain
"""

from __future__ import annotations

import logging
import sys

from app import db
from app.ml.train import NotEnoughData, train_outlet

log = logging.getLogger("weekly_retrain")


def run() -> int:
    failures = 0
    for outlet in db.all_outlets():
        try:
            res = train_outlet(outlet["id"], promote=True)
            best = next((r["overall"] for r in res["results"] if r["model"] == res["model"]), None)
            log.info("%s: promoted %s %s (MAE %.2f, %s%% better than naive)", outlet["name"], res["model"],
                     res["version"], best["mae"] if best else float("nan"), res["improvement_vs_naive_pct"])
        except NotEnoughData as exc:
            log.warning("%s: skipped, %s", outlet["name"], exc)
        except Exception:
            failures += 1
            log.exception("%s: training failed", outlet["name"])
    return failures


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sys.exit(1 if run() else 0)
