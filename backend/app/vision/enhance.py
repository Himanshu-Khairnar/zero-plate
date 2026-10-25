"""Unit 1 - image enhancement in the spatial domain.

Kitchen photos are taken on phones under mixed, uneven lighting and are often
grainy. These helpers bring an image to a working size and colour space,
remove noise and normalise contrast before any measurement is taken.
"""

from __future__ import annotations

import cv2
import numpy as np

WORK_LONG_SIDE = 512


def resize_long_side(img: np.ndarray, long_side: int = WORK_LONG_SIDE) -> tuple[np.ndarray, float]:
    """Scale normalisation (geometric transform): resize so the longer side is
    ``long_side`` pixels. INTER_AREA when shrinking (anti-aliased), bicubic when
    enlarging. Returns the image and the scale factor applied."""
    h, w = img.shape[:2]
    scale = long_side / max(h, w)
    if abs(scale - 1.0) < 1e-6:
        return img.copy(), 1.0
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    out = cv2.resize(img, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=interp)
    return out, scale


def to_gray(bgr: np.ndarray) -> np.ndarray:
    """BGR -> 8-bit grey level (luma Y = 0.299R + 0.587G + 0.114B)."""
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


def to_hsv(bgr: np.ndarray) -> np.ndarray:
    """BGR -> HSV (OpenCV 8-bit: H in [0,180), S and V in [0,255])."""
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)


def to_lab(bgr: np.ndarray) -> np.ndarray:
    """BGR -> CIE L*a*b* (8-bit). Euclidean distance in Lab approximates
    perceived colour difference, which is what the food cue relies on."""
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)


def denoise(bgr: np.ndarray, median_ksize: int = 5, gaussian_ksize: int = 5, sigma: float = 1.0) -> np.ndarray:
    """Two-step noise removal.

    1. Median filter (non-linear, order statistic) removes salt-and-pepper
       noise without blurring edges much.
    2. Gaussian smoothing (linear low-pass) suppresses residual sensor noise.
    """
    out = cv2.medianBlur(bgr, median_ksize)
    return cv2.GaussianBlur(out, (gaussian_ksize, gaussian_ksize), sigma)


def equalize_histogram(gray: np.ndarray) -> np.ndarray:
    """Global histogram equalisation: maps grey levels through the normalised
    cumulative histogram so the output histogram is approximately flat."""
    return cv2.equalizeHist(gray)


def clahe(gray: np.ndarray, clip_limit: float = 2.0, tile: int = 8) -> np.ndarray:
    """Contrast Limited Adaptive Histogram Equalisation on one channel.
    Equalises per tile with a clipped histogram (limits noise amplification),
    then bilinearly blends tiles - good for unevenly lit counters."""
    return cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile)).apply(gray)


def clahe_bgr(bgr: np.ndarray, clip_limit: float = 2.0, tile: int = 8) -> np.ndarray:
    """CLAHE applied to the L channel of Lab only, so hues are preserved."""
    lab = to_lab(bgr)
    lab[..., 0] = clahe(lab[..., 0], clip_limit, tile)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def contrast_stretch(gray: np.ndarray, low_pct: float = 2.0, high_pct: float = 98.0) -> np.ndarray:
    """Piecewise-linear contrast stretching: maps the [low_pct, high_pct]
    percentile range linearly onto [0, 255] and clips the tails."""
    lo, hi = np.percentile(gray, [low_pct, high_pct])
    if hi - lo < 1e-6:
        return gray.copy()
    out = (gray.astype(np.float32) - lo) * (255.0 / (hi - lo))
    return np.clip(out, 0, 255).astype(np.uint8)


def high_boost(img: np.ndarray, boost: float = 1.5, sigma: float = 2.0) -> np.ndarray:
    """Unsharp masking / high-boost filtering: out = img + k * (img - blur).
    k = 1 is classic unsharp masking; k > 1 is high-boost."""
    f = img.astype(np.float32)
    blur = cv2.GaussianBlur(f, (0, 0), sigma)
    return np.clip(f + boost * (f - blur), 0, 255).astype(np.uint8)


def histogram(gray: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """256-bin grey-level histogram (counts), optionally inside a mask."""
    return cv2.calcHist([gray], [0], mask, [256], [0, 256]).ravel()
