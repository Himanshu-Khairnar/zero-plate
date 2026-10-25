"""The full pipeline: one photo in, plate measurements out, every stage timed.

Stages (in order)
    decode      bytes -> BGR (OpenCV, Pillow fallback for other formats)
    resize      scale normalisation to a 512 px long side
    denoise     median + Gaussian
    enhance     CLAHE on Lab L (used for plate detection and edges)
    plate       Hough circle / largest contour -> ROI
    illumination DFT Gaussian low-pass shading estimate, divided out
    threshold   Lab distance from plate colour + Otsu
    morphology  opening / closing / hole filling
    watershed   distance transform + marker-controlled watershed
    edges       Sobel / Canny / LoG / DoG texture measures on the food
    features    HOG, HSV histogram, Hu moments, pyramid edge density, DFT texture
    encode      RLE of the food mask
"""

from __future__ import annotations

import io
import time
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

from app.vision import compression, edges, enhance, features, frequency, segment

MIN_INPUT_SIDE = 64


@dataclass
class PipelineResult:
    plate: segment.Plate
    fill_ratio: float
    portion_count: int
    segment_areas: list[int]           # pixels, descending
    segment_fractions: list[float]     # of plate area
    dominant_colour: dict
    feature_vector: np.ndarray
    feature_parts: dict[str, int]      # name -> length inside feature_vector
    measures: dict[str, Any]
    mask_rle: dict
    timings_ms: dict[str, float]
    shape: tuple[int, int]
    mask: np.ndarray
    labels: np.ndarray
    stages: dict[str, Any] = field(default_factory=dict)  # intermediates (keep_stages=True)


MAX_DECODE_SIDE = 1024   # decode big photos at reduced size (JPEG DCT scaling)


def _reduced_flag(data: bytes) -> int:
    """Pick IMREAD_REDUCED_COLOR_{2,4,8} so a large photo is decoded at most
    ~2x the 512 px working size instead of at full resolution (a 12 MP phone
    photo would otherwise cost ~36 MB and most of the request time). The image
    header is read with Pillow, which does not decode pixels."""
    try:
        from PIL import Image
        w, h = Image.open(io.BytesIO(data)).size
    except Exception:
        return cv2.IMREAD_COLOR
    side = max(w, h)
    for k, flag in ((8, cv2.IMREAD_REDUCED_COLOR_8), (4, cv2.IMREAD_REDUCED_COLOR_4), (2, cv2.IMREAD_REDUCED_COLOR_2)):
        if side / k >= MAX_DECODE_SIDE:
            return flag
    return cv2.IMREAD_COLOR


def decode_image(data: bytes) -> np.ndarray:
    """Decode an encoded image to BGR uint8 (alpha dropped, large images
    decoded at reduced size). Raises ValueError if unreadable."""
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, _reduced_flag(data)) if arr.size else None
    if img is None:
        try:  # formats OpenCV was not built with
            from PIL import Image
            pil = Image.open(io.BytesIO(data))
            pil.thumbnail((MAX_DECODE_SIDE, MAX_DECODE_SIDE))
            pil = pil.convert("RGB")
            img = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
        except Exception as exc:
            raise ValueError(f"not a decodable image ({exc})") from exc
    return img


def analyse(bgr: np.ndarray, keep_stages: bool = False, flatten_light: bool = True) -> PipelineResult:
    """Run every stage on a BGR image. ``keep_stages`` keeps the intermediate
    images (for figures / tests); the API leaves it off. ``flatten_light=False``
    skips the DFT illumination correction (used for the ablation in the report)."""
    t: dict[str, float] = {}
    st: dict[str, Any] = {}
    clock = time.perf_counter

    def done(name: str, t0: float) -> float:
        t[name] = round((clock() - t0) * 1000, 3)
        return clock()

    t0 = clock()
    # Unit 4: scale normalisation (tiny inputs are first enlarged).
    if min(bgr.shape[:2]) < MIN_INPUT_SIDE:
        bgr, _ = enhance.resize_long_side(bgr, MIN_INPUT_SIDE * 2)
    img, scale = enhance.resize_long_side(bgr)
    t0 = done("resize", t0)

    # Unit 1: noise removal + contrast enhancement.
    den = enhance.denoise(img)
    t0 = done("denoise", t0)
    enh = enhance.clahe_bgr(den)
    gray = enhance.to_gray(enh)
    t0 = done("enhance", t0)

    # Units 2/5: plate ROI.
    plate = segment.detect_plate(den, gray)
    roi = segment.plate_mask(img.shape, plate)
    plate_px = segment.plate_area_px(img.shape, plate)
    t0 = done("plate", t0)

    # Unit 3: illumination flattening with a DFT Gaussian low-pass.
    lab = enhance.to_lab(den)
    # Plates are neutral (low chroma), food is not: estimate shading from
    # plate-like pixels only, so food does not pull the estimate down.
    chroma = np.hypot(lab[..., 1].astype(np.float32) - 128, lab[..., 2].astype(np.float32) - 128)
    plate_like = ((roi > 0) & (chroma < 12)).astype(np.uint8)
    if np.count_nonzero(plate_like) < 0.2 * max(1, np.count_nonzero(roi)):
        plate_like = roi
    illum = frequency.estimate_illumination(lab[..., 0], plate_like, cutoff=3.0)
    lab_flat = lab.copy()
    if flatten_light:
        lab_flat[..., 0] = frequency.flatten_illumination(lab[..., 0], illum)
    t0 = done("illumination", t0)

    # Unit 2: food cue + Otsu global threshold.
    hsv = enhance.to_hsv(den)
    ref = segment.plate_reference_colour(lab_flat, hsv, plate, roi)
    cue = segment.food_cue(lab_flat, ref)
    raw_mask, thr = segment.otsu_threshold(cue, roi)
    t0 = done("threshold", t0)

    # Unit 3: morphology.
    mask = segment.clean_mask(raw_mask, plate.r, roi)
    t0 = done("morphology", t0)

    # Unit 5: distance transform + watershed + connected components.
    labels, dist, _ = segment.watershed_segments(den, mask, plate.r)
    min_seg = int(segment.MIN_SEGMENT_FRAC * plate_px)
    areas = segment.segment_areas(labels, min_seg)
    components = segment.count_components(mask, min_seg)
    t0 = done("watershed", t0)

    # Units 2/5: edge operators as texture measures of the food region.
    gray_den = enhance.to_gray(den)
    _, _, sob = edges.sobel_gradients(gray_den)
    can, can_thr = edges.auto_canny(gray)
    log = edges.laplacian_of_gaussian(gray_den, 2.0)
    dog = edges.difference_of_gaussians(gray_den, 1.0, 2.0)
    m = mask > 0
    edge_meas = {
        "sobelMeanFood": round(float(sob[m].mean()) if m.any() else 0.0, 2),
        "cannyDensityFood": round(edges.edge_density(can, mask), 4),
        "logEnergyFood": round(float(np.abs(log[m]).mean()) if m.any() else 0.0, 3),
        "dogEnergyFood": round(float(np.abs(dog[m]).mean()) if m.any() else 0.0, 3),
    }
    t0 = done("edges", t0)

    # Unit 4: normalised ROI, rotation alignment, descriptors.
    roi_img = features.crop_to_plate(den, plate)
    roi_mask = features.crop_to_plate(mask, plate, nearest=True)
    angle = features.principal_angle(roi_mask)
    roi_gray = enhance.to_gray(features.rotate(roi_img, angle))
    hog_vec, hog_cells = features.hog(roi_gray)
    col_hist = features.colour_histogram(den, mask)
    hu = features.hu_moments(roi_mask)
    ms_edges = features.multiscale_edge_density(enhance.to_gray(roi_img), roi_mask)
    texture = frequency.high_frequency_energy_ratio(roi_gray)
    dom = features.dominant_colour(den, mask)
    fill = float(np.count_nonzero(mask)) / plate_px if plate_px else 0.0
    shape_vec = np.array([fill, len(areas), components, texture, *ms_edges], np.float32)
    vec = np.concatenate([hog_vec, col_hist, hu, shape_vec]).astype(np.float32)
    parts = {"hog": int(hog_vec.size), "hsvHistogram": int(col_hist.size), "huMoments": int(hu.size),
             "shape": int(shape_vec.size)}
    t0 = done("features", t0)

    # Unit 6: run-length encode the normalised mask.
    rle = compression.compress_mask(roi_mask)
    full_rle = compression.compress_mask(mask)
    rle["fullResolution"] = {k: full_rle[k] for k in ("shape", "runs", "rleBytes", "bitmapBytes", "ratioVsBitmap", "ratioVs8bit")}
    t0 = done("encode", t0)

    measures = {
        "otsuThreshold": round(thr, 1),
        "plateRefLab": [round(float(x), 1) for x in ref],
        "connectedComponents": components,
        "principalAngle": round(angle, 1),
        "textureHighFreqRatio": round(texture, 4),
        "pyramidEdgeDensity": ms_edges,
        "cannyThresholds": list(can_thr),
        "scale": round(scale, 4),
        **edge_meas,
    }
    if keep_stages:
        st = {"input": img, "denoised": den, "enhanced": enh, "gray": gray, "roi": roi, "lab": lab,
              "illumination": illum, "lab_flat": lab_flat, "cue": cue, "raw_mask": raw_mask, "mask": mask,
              "dist": dist, "labels": labels, "sobel": sob, "canny": can, "log": log, "dog": dog,
              "roi_img": roi_img, "roi_mask": roi_mask, "roi_gray": roi_gray, "hog_cells": hog_cells}

    return PipelineResult(
        plate=plate, fill_ratio=round(fill, 4), portion_count=len(areas), segment_areas=areas,
        segment_fractions=[round(a / plate_px, 4) for a in areas], dominant_colour=dom,
        feature_vector=vec, feature_parts=parts, measures=measures, mask_rle=rle, timings_ms=t,
        shape=(int(img.shape[0]), int(img.shape[1])), mask=mask, labels=labels, stages=st,
    )
