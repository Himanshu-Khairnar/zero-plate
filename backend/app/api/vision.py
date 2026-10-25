"""Module H: waste photo recognition.

`POST /api/vision/recognize` takes a photo of a plate (or tray / bin) of
leftovers and returns candidate items with an estimated quantity and a
confidence. Request and response keys are unchanged from heuristic-v0, so the
web waste-log flow needs no changes.

Measurement is a classical image-processing / computer-vision pipeline
(`app.vision`): denoising, CLAHE, plate detection by Hough transform, DFT
illumination flattening, Otsu segmentation of the food against the plate,
morphological clean-up, distance transform + watershed to split touching
portions, and HOG / colour / moment features. It measures *how much* food is
left and *how many* portions; it is not a trained food detector, so dish
identity still comes from this outlet's recent waste and prep volumes (the
same ranking as before), nudged by the dominant colour of the food.

Safety nets so real users never get a worse answer than heuristic-v0:
- OpenCV is imported lazily on the first request (keeps start-up memory low).
- Any exception inside the pipeline falls back to the original Pillow
  colour-statistics heuristic (model "heuristic-v0") instead of a 500.
- When no plate is found (tray / bin photo), quantity uses the original
  heuristic's tray formula; the pipeline only adjusts confidence.
"""

from __future__ import annotations

import io
import logging
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image, ImageStat
from starlette.concurrency import run_in_threadpool

from app import db

if TYPE_CHECKING:
    from app.vision.pipeline import PipelineResult

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vision", tags=["vision"])

MODEL_NAME = "opencv-pipeline-v1"
FALLBACK_MODEL = "heuristic-v0"
NOTE = (
    "Classical computer vision, not a trained food detector: the amount (plate fill ratio and "
    "number of portions) is measured from the photo by segmentation; the dish names are ranked "
    "from this outlet's recent waste and prep volumes, nudged by the food's dominant colour. "
    "Confirm or correct before saving."
)
FALLBACK_NOTE = (
    "Stand-in suggestions from simple image colour statistics plus this outlet's recent waste and "
    "prep volumes (the image-analysis pipeline could not process this photo). Confirm or correct "
    "before saving."
)
MAX_BYTES = 5 * 1024 * 1024

# One full serving covers roughly a quarter of a standard plate (assumption,
# used to turn measured area into servings).
SERVING_FILL = 0.25
MIN_FOOD_FILL = 0.005

# Coarse hue bands (degrees) -> dish categories (heuristic-v0, used by the fallback).
HUE_CATEGORY = [
    ((0, 25), ["Mains", "Street"]),        # reds/oranges: gravies, bhaji
    ((25, 60), ["Breakfast", "Street"]),   # yellows: dosa, pav, fried items
    ((60, 160), ["Mains", "Sides"]),       # greens: veg
    ((160, 260), ["Beverages", "Desserts"]),
    ((260, 360), ["Desserts", "Mains"]),
]

# Dominant food colour (pipeline) -> dish categories that usually look that way.
COLOUR_CATEGORY: dict[str, list[str]] = {
    "red": ["Mains", "Street"],          # gravies, pav bhaji
    "orange": ["Mains", "Street"],
    "yellow": ["Breakfast", "Mains"],    # dal, poha, dosa
    "green": ["Mains", "Sides"],         # sabzi, palak
    "brown": ["Breakfast", "Mains"],     # roti, paratha, fried items
    "brown/grey": ["Mains", "Sides"],
    "white/cream": ["Sides", "Desserts"],  # rice, curd, kheer
    "blue": ["Beverages", "Desserts"],
    "purple": ["Desserts", "Mains"],
}
# Confidence adjustment by how the plate was found (CV can only nudge, range stays 0.3-0.6).
PLATE_CONFIDENCE = {"hough": 0.05, "contour": 0.0, "frame": -0.05}


# --------------------------------------------------------------------------- heuristic-v0 (fallback)

def _image_features(data: bytes) -> dict[str, float]:
    """Original colour/texture statistics (Pillow). Also validates the upload."""
    img = Image.open(io.BytesIO(data))
    img.draft("RGB", (512, 512))  # JPEG: decode at reduced size
    img = img.convert("RGB")
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


def _hue_categories(hue: float) -> list[str]:
    for (lo, hi), cats in HUE_CATEGORY:
        if lo <= hue < hi:
            return cats
    return []


def _heuristic_qty(feats: dict[str, float]) -> int:
    """heuristic-v0 quantity: share of frame that looks like food, scaled to a tray of ~12 plates."""
    return 2 + round(10 * feats["fill"] * (0.6 + feats["saturation"]))


# --------------------------------------------------------------------------- pipeline

def estimate_servings(r: "PipelineResult") -> int:
    """Servings left on a plate = sum over detected portions of
    min(1, (portion area / plate area) / SERVING_FILL), at least 1."""
    total = sum(min(1.0, frac / SERVING_FILL) for frac in r.segment_fractions)
    if total == 0 and r.fill_ratio >= MIN_FOOD_FILL:
        total = r.fill_ratio / SERVING_FILL
    return max(1, int(total + 0.5))


def _run_pipeline(data: bytes) -> "PipelineResult":
    from app.vision import analyse, decode_image  # lazy: OpenCV loads on first use

    return analyse(decode_image(data))


def _pipeline_features(r: "PipelineResult", heur: dict[str, float]) -> dict[str, Any]:
    dom = r.dominant_colour
    return {
        **heur,  # heuristic-v0 keys stay available
        "plate": r.plate.as_dict(),
        "imageSize": list(r.shape),
        "fillRatio": r.fill_ratio,
        "portionCount": r.portion_count,
        "segmentAreas": r.segment_areas,
        "segmentFractions": r.segment_fractions,
        "dominantColour": dom,
        "featureVector": {"length": int(r.feature_vector.size), "parts": r.feature_parts},
        "measures": r.measures,
        "maskRle": r.mask_rle,
        "timingsMs": r.timings_ms,
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


def _suggest(candidates: list[dict[str, Any]], likely_categories: list[str], qty: int,
             conf_adj: float, fallback_label: str) -> list[dict[str, Any]]:
    """heuristic-v0 ranking (recent waste 0.5, prep volume 0.3, colour category 0.2)."""
    scored: list[tuple[float, dict[str, Any]]] = []
    max_waste = max((float(c["wasted"]) for c in candidates), default=0.0) or 1.0
    max_vol = max((float(c["volume"]) + float(c["prep_target"] or 0) for c in candidates), default=0.0) or 1.0
    for c in candidates:
        score = 0.5 * float(c["wasted"]) / max_waste + 0.3 * (float(c["volume"]) + float(c["prep_target"] or 0)) / max_vol
        if c["category"] in likely_categories:
            score += 0.2 * (1 if c["category"] == likely_categories[0] else 0.6)
        scored.append((score, c))
    scored.sort(key=lambda t: -t[0])

    items = []
    for rank, (score, c) in enumerate(scored[:3]):
        confidence = round(min(0.6, max(0.3, 0.3 + 0.3 * score + conf_adj)), 2)
        items.append({
            "label": c["name"],
            "dishName": c["name"],
            "category": c["category"],
            "estimatedQty": max(1, int(round(qty / (rank + 1)))),
            "confidence": confidence,
        })
    if not items:
        cat = likely_categories[0] if likely_categories else None
        items.append({"label": fallback_label, "dishName": None, "category": cat,
                      "estimatedQty": max(1, qty), "confidence": round(min(0.6, max(0.3, 0.3 + conf_adj)), 2)})
    return items


@router.post("/recognize")
async def recognize(image: UploadFile = File(...), outletId: str | None = Form(default=None)) -> dict[str, Any]:
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty image")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="image larger than 5 MB")
    try:
        heur = _image_features(data)
    except Exception as exc:  # not an image
        raise HTTPException(status_code=400, detail=f"could not read image: {exc}") from exc

    try:
        result = await run_in_threadpool(_run_pipeline, data)
    except Exception:  # never fail the request because of the CV pipeline
        log.exception("vision pipeline failed; falling back to %s", FALLBACK_MODEL)
        result = None

    candidates = _candidates(outletId)

    if result is None:
        cats = _hue_categories(heur["hue"])
        qty = max(1, _heuristic_qty(heur) // 2) if not candidates else _heuristic_qty(heur)
        items = _suggest(candidates, cats, qty, 0.0, (cats[0] if cats else "Food") + " item")
        return {"items": items, "model": FALLBACK_MODEL, "note": FALLBACK_NOTE, "features": heur}

    feats = _pipeline_features(result, heur)
    likely_categories = COLOUR_CATEGORY.get(result.dominant_colour["name"]) or _hue_categories(heur["hue"])
    food_seen = result.fill_ratio >= MIN_FOOD_FILL
    if result.plate.method == "frame":
        # No plate (tray / bin photo): keep the heuristic-v0 tray quantity.
        qty = _heuristic_qty(heur)
        if not candidates:
            qty = max(1, qty // 2)
    else:
        qty = estimate_servings(result)
    feats["estimatedServings"] = qty
    conf_adj = PLATE_CONFIDENCE[result.plate.method] + (0.0 if food_seen else -0.05)
    label = f"{likely_categories[0] if likely_categories else 'Food'} item ({result.dominant_colour['name']})"
    items = _suggest(candidates, likely_categories, qty, conf_adj, label)
    return {"items": items, "model": MODEL_NAME, "note": NOTE, "features": feats}
