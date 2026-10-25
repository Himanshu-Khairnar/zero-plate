"""Unit 4 - geometric normalisation and feature description.

The food region is cropped to the plate, resized to a fixed size (scale
normalisation) and rotated so its principal axis is horizontal (rotation
normalisation). From it we compute a HOG descriptor, an HSV colour histogram,
Hu's seven moment invariants and multi-scale edge density from a Gaussian
pyramid. The colour histogram and Hu moments are rotation invariant by
construction; HOG becomes so through the principal-axis alignment.
"""

from __future__ import annotations

import cv2
import numpy as np

from app.vision.edges import auto_canny, edge_density
from app.vision.segment import Plate

NORM_SIZE = 128


# --------------------------------------------------------------------------- geometry

def crop_to_plate(img: np.ndarray, plate: Plate, size: int = NORM_SIZE, nearest: bool = False) -> np.ndarray:
    """Square crop around the plate circle, resized to ``size`` x ``size``
    (``nearest=True`` for masks, area interpolation for images)."""
    h, w = img.shape[:2]
    r = plate.r
    x0, y0 = int(round(plate.cx - r)), int(round(plate.cy - r))
    x1, y1 = int(round(plate.cx + r)), int(round(plate.cy + r))
    pad = max(0, -x0, -y0, x1 - w, y1 - h)
    if pad:
        border = [0] * (img.shape[2] if img.ndim == 3 else 1)
        img = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=border)
        x0, y0, x1, y1 = x0 + pad, y0 + pad, x1 + pad, y1 + pad
    crop = img[y0:y1, x0:x1]
    return cv2.resize(crop, (size, size), interpolation=cv2.INTER_NEAREST if nearest else cv2.INTER_AREA)


def principal_angle(mask: np.ndarray) -> float:
    """Orientation (degrees) of the mask's principal axis from second-order
    central moments: theta = 0.5 * atan2(2 mu11, mu20 - mu02)."""
    m = cv2.moments(mask, binaryImage=True)
    if m["m00"] == 0:
        return 0.0
    return float(np.degrees(0.5 * np.arctan2(2 * m["mu11"], m["mu20"] - m["mu02"])))


def rotate(img: np.ndarray, angle_deg: float, nearest: bool = False) -> np.ndarray:
    """Rotate about the image centre (affine transform, size preserved)."""
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle_deg, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_NEAREST if nearest else cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT)


def gaussian_pyramid(img: np.ndarray, levels: int = 3) -> list[np.ndarray]:
    """Gaussian pyramid: repeated Gaussian blur + 2x down-sampling (pyrDown)."""
    out = [img]
    for _ in range(levels - 1):
        if min(out[-1].shape[:2]) < 16:
            break
        out.append(cv2.pyrDown(out[-1]))
    return out


# --------------------------------------------------------------------------- HOG

def hog(gray: np.ndarray, cell: int = 16, bins: int = 9, block: int = 2) -> tuple[np.ndarray, np.ndarray]:
    """Histogram of Oriented Gradients (Dalal & Triggs).

    1. gradients with centred [-1, 0, 1] differences;
    2. per cell, a ``bins``-bin histogram of unsigned orientation (0-180 deg)
       weighted by magnitude, with linear interpolation between bins;
    3. L2-Hys normalisation over overlapping ``block`` x ``block`` cells.
    Returns (descriptor, cell_histograms[cy, cx, bins])."""
    g = gray.astype(np.float32)
    gx = cv2.filter2D(g, cv2.CV_32F, np.array([[-1, 0, 1]], np.float32))
    gy = cv2.filter2D(g, cv2.CV_32F, np.array([[-1], [0], [1]], np.float32))
    mag = np.hypot(gx, gy)
    ang = np.rad2deg(np.arctan2(gy, gx)) % 180.0
    cy, cx = g.shape[0] // cell, g.shape[1] // cell
    mag, ang = mag[:cy * cell, :cx * cell], ang[:cy * cell, :cx * cell]
    width = 180.0 / bins
    pos = ang / width - 0.5
    lo = np.floor(pos).astype(int) % bins
    hi = (lo + 1) % bins
    w_hi = pos - np.floor(pos)
    hist = np.zeros((cy, cx, bins), np.float32)
    rows = np.repeat(np.arange(cy), cell)[:, None].repeat(cx * cell, 1)
    cols = np.repeat(np.arange(cx), cell)[None, :].repeat(cy * cell, 0)
    np.add.at(hist, (rows, cols, lo), mag * (1 - w_hi))
    np.add.at(hist, (rows, cols, hi), mag * w_hi)
    feats = []
    for by in range(cy - block + 1):
        for bx in range(cx - block + 1):
            v = hist[by:by + block, bx:bx + block].ravel()
            v = v / np.sqrt(np.sum(v ** 2) + 1e-6)
            v = np.minimum(v, 0.2)
            v = v / np.sqrt(np.sum(v ** 2) + 1e-6)
            feats.append(v)
    desc = np.concatenate(feats) if feats else np.zeros(0, np.float32)
    return desc.astype(np.float32), hist


def hog_visualise(cell_hist: np.ndarray, cell: int = 16, scale: int = 2) -> np.ndarray:
    """Draw each cell's orientation histogram as a star of line segments
    (segment orientation = gradient orientation + 90 deg, i.e. the edge)."""
    cy, cx, bins = cell_hist.shape
    s = cell * scale
    img = np.zeros((cy * s, cx * s), np.uint8)
    mx = float(cell_hist.max()) or 1.0
    for y in range(cy):
        for x in range(cx):
            c = (x * s + s // 2, y * s + s // 2)
            for b in range(bins):
                v = cell_hist[y, x, b] / mx
                if v < 0.05:
                    continue
                theta = np.deg2rad((b + 0.5) * 180.0 / bins + 90)
                dx, dy = np.cos(theta) * s * 0.48, np.sin(theta) * s * 0.48
                cv2.line(img, (int(c[0] - dx), int(c[1] - dy)), (int(c[0] + dx), int(c[1] + dy)),
                         int(255 * v), 1, cv2.LINE_AA)
    return img


# --------------------------------------------------------------------------- colour / shape

def colour_histogram(bgr: np.ndarray, mask: np.ndarray, h_bins: int = 12, s_bins: int = 4) -> np.ndarray:
    """Normalised 2-D Hue-Saturation histogram of the food pixels (L1 = 1).
    Ignores geometry entirely, so it is rotation and translation invariant."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    m = mask if mask is not None and np.count_nonzero(mask) else None
    hist = cv2.calcHist([hsv], [0, 1], m, [h_bins, s_bins], [0, 180, 0, 256]).ravel()
    total = float(hist.sum())
    return (hist / total if total else hist).astype(np.float32)


def hu_moments(mask: np.ndarray) -> np.ndarray:
    """Hu's seven moment invariants (translation, scale and rotation
    invariant), log-scaled: -sign(h) * log10|h|."""
    hu = cv2.HuMoments(cv2.moments(mask, binaryImage=True)).ravel()
    out = np.zeros_like(hu)
    nz = np.abs(hu) > 1e-30
    out[nz] = -np.sign(hu[nz]) * np.log10(np.abs(hu[nz]))
    return out.astype(np.float32)


COLOUR_NAMES = [  # (hue range in degrees, name)
    ((0, 20), "red"), ((20, 45), "orange"), ((45, 70), "yellow"), ((70, 170), "green"),
    ((170, 260), "blue"), ((260, 330), "purple"), ((330, 360), "red"),
]


def dominant_colour(bgr: np.ndarray, mask: np.ndarray) -> dict:
    """Dominant colour of the food: circular mean hue of saturated food pixels,
    plus mean saturation / value. Low-saturation food is 'white/cream' when
    bright and 'brown/grey' otherwise; dark orange/red is 'brown'."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sel = mask > 0
    if not np.any(sel):
        sel = np.ones(mask.shape, bool)
    h = hsv[..., 0][sel].astype(np.float32) * 2.0
    s = hsv[..., 1][sel].astype(np.float32)
    v = hsv[..., 2][sel].astype(np.float32)
    sat_px = s > 60
    if np.count_nonzero(sat_px) > 0.3 * s.size:
        rad = np.deg2rad(h[sat_px])
        hue = float(np.rad2deg(np.arctan2(np.sin(rad).mean(), np.cos(rad).mean())) % 360)
    else:
        hue = float(np.median(h))
    ms, mv = float(s.mean()) / 255, float(v.mean()) / 255
    if ms < 0.2:
        name = "white/cream" if mv > 0.7 else "brown/grey"
    else:
        name = next(n for (lo, hi), n in COLOUR_NAMES if lo <= hue < hi)
        if name in ("orange", "red") and mv < 0.45:
            name = "brown"
    return {"name": name, "hue": round(hue, 1), "saturation": round(ms, 3), "value": round(mv, 3)}


def multiscale_edge_density(gray: np.ndarray, mask: np.ndarray, levels: int = 3) -> list[float]:
    """Canny edge density of the food region at each Gaussian-pyramid level."""
    out = []
    for g, m in zip(gaussian_pyramid(gray, levels), gaussian_pyramid(mask, levels)):
        e, _ = auto_canny(g)
        out.append(round(edge_density(e, (m > 127).astype(np.uint8)), 4))
    return out
