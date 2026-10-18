"""Module H: waste photo recognition.

`POST /api/vision/recognize` takes a photo of leftover trays or the waste bin
and returns candidate items with an estimated quantity and a confidence.

What ships here is an honest **stand-in** for the fine-tuned CNN / YOLO
detector from the plan: it reads simple colour and texture statistics from the
image and combines them with what this outlet actually wastes and cooks most,
so staff always get a sensible shortlist to confirm or correct. The response
shape is the contract the real detector will fill in later.
"""

from __future__ import annotations

import io
import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image, ImageStat

from app import db

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vision", tags=["vision"])

MODEL_NAME = "heuristic-v0"
NOTE = (
    "Stand-in for the fine-tuned food detector: suggestions are based on image "
    "colour/texture plus this outlet's recent waste and prep volumes. Confirm or "
    "correct before saving."
)
MAX_BYTES = 5 * 1024 * 1024

# Coarse hue bands (degrees) -> dish categories that usually look that way.
HUE_CATEGORY = [
    ((0, 25), ["Mains", "Street"]),        # reds/oranges: gravies, bhaji
    ((25, 60), ["Breakfast", "Street"]),   # yellows: dosa, pav, fried items
    ((60, 160), ["Mains", "Sides"]),       # greens: veg
    ((160, 260), ["Beverages", "Desserts"]),
    ((260, 360), ["Desserts", "Mains"]),
]


def _image_features(data: bytes) -> dict[str, float]:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((256, 256))
    hsv = img.convert("HSV")
    h_hist = hsv.getchannel("H").histogram()
    total = max(sum(h_hist), 1)
    dominant_bin = max(range(256), key=lambda i: h_hist[i])
    hue_deg = dominant_bin / 255 * 360
    stat = ImageStat.Stat(img)
    brightness = sum(stat.mean) / 3 / 255
    contrast = sum(stat.stddev) / 3 / 255
    sat = ImageStat.Stat(hsv.getchannel("S")).mean[0] / 255
    # "Fill" ≈ share of pixels that are neither near-white nor near-black (food vs tray).
    gray = img.convert("L").histogram()
    filled = sum(gray[20:235]) / max(sum(gray), 1)
    return {
        "hue": round(hue_deg, 1),
        "saturation": round(sat, 3),
        "brightness": round(brightness, 3),
        "contrast": round(contrast, 3),
        "fill": round(filled, 3),
        "hue_share": round(h_hist[dominant_bin] / total, 3),
    }


def _candidates(outlet_id: str | None) -> list[dict[str, Any]]:
    """Dishes ranked by recent waste, then by prep volume, with their category."""
    if not outlet_id:
        return []
    since = (date.today() - timedelta(days=30)).isoformat()
    rows = db.fetch_all(
        """
        SELECT d.id, d.name, d.category,
               COALESCE((SELECT SUM(w.qty) FROM "WasteLog" w WHERE w."dishId" = d.id AND w.date >= :since), 0) AS wasted,
               COALESCE((SELECT SUM(f.likely) FROM "Forecast" f WHERE f."dishId" = d.id), 0) AS volume,
               d."prepTarget" AS prep_target
        FROM "Dish" d
        WHERE d."outletId" = :o AND d."isActive" = :t
        """,
        {"o": outlet_id, "since": since, "t": True},
    )
    return rows


@router.post("/recognize")
async def recognize(image: UploadFile = File(...), outletId: str | None = Form(default=None)) -> dict[str, Any]:
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty image")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="image larger than 5 MB")
    try:
        feats = _image_features(data)
    except Exception as exc:  # not an image
        raise HTTPException(status_code=400, detail=f"could not read image: {exc}") from exc

    likely_categories: list[str] = []
    for (lo, hi), cats in HUE_CATEGORY:
        if lo <= feats["hue"] < hi:
            likely_categories = cats
            break

    candidates = _candidates(outletId)
    scored: list[tuple[float, dict[str, Any]]] = []
    max_waste = max((float(c["wasted"]) for c in candidates), default=0.0) or 1.0
    max_vol = max((float(c["volume"]) + float(c["prep_target"] or 0) for c in candidates), default=0.0) or 1.0
    for c in candidates:
        score = 0.5 * float(c["wasted"]) / max_waste + 0.3 * (float(c["volume"]) + float(c["prep_target"] or 0)) / max_vol
        if c["category"] in likely_categories:
            score += 0.2 * (1 if likely_categories and c["category"] == likely_categories[0] else 0.6)
        scored.append((score, c))
    scored.sort(key=lambda t: -t[0])

    # Quantity guess: how much of the frame looks like food, scaled to a tray of ~12 plates.
    qty_scale = 2 + round(10 * feats["fill"] * (0.6 + feats["saturation"]))
    items = []
    for rank, (score, c) in enumerate(scored[:3]):
        confidence = round(min(0.6, max(0.3, 0.3 + 0.3 * score)), 2)
        items.append({
            "label": c["name"],
            "dishName": c["name"],
            "category": c["category"],
            "estimatedQty": max(1, int(round(qty_scale / (rank + 1)))),
            "confidence": confidence,
        })
    if not items:
        label = (likely_categories[0] if likely_categories else "Food") + " item"
        items.append({"label": label, "dishName": None, "category": likely_categories[0] if likely_categories else None,
                      "estimatedQty": max(1, qty_scale // 2), "confidence": 0.3})

    return {"items": items, "model": MODEL_NAME, "note": NOTE, "features": feats}
