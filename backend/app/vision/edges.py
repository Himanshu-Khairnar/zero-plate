"""Unit 2 / Unit 5 - edge detection.

Edges are used as texture measurements of the food region (gravy is smooth,
rice and sabzi are busy) and are shown in the report for comparison of the
first-order (Sobel, Canny) and second-order (LoG, DoG) operators.
"""

from __future__ import annotations

import cv2
import numpy as np


def sobel_gradients(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """First-order derivatives with 3x3 Sobel kernels.
    Returns (gx, gy, magnitude) as float32; magnitude = sqrt(gx^2 + gy^2)."""
    g = gray.astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    return gx, gy, cv2.magnitude(gx, gy)


def auto_canny(gray: np.ndarray, sigma: float = 0.33) -> tuple[np.ndarray, tuple[int, int]]:
    """Canny edge detector (Gaussian smoothing, gradient, non-maximum
    suppression, hysteresis) with thresholds set around the median grey level."""
    v = float(np.median(gray))
    lo = int(max(0, (1.0 - sigma) * v))
    hi = int(min(255, (1.0 + sigma) * v))
    lo, hi = max(lo, 10), max(hi, 30)
    return cv2.Canny(gray, lo, hi, L2gradient=True), (lo, hi)


def laplacian_of_gaussian(gray: np.ndarray, sigma: float = 2.0) -> np.ndarray:
    """LoG (Marr-Hildreth): Gaussian smoothing followed by the Laplacian.
    Returns the signed float32 response; edges lie on its zero crossings."""
    blur = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), sigma)
    return cv2.Laplacian(blur, cv2.CV_32F, ksize=3)


def zero_crossings(response: np.ndarray, min_slope: float = 1.0) -> np.ndarray:
    """Binary map of sign changes (horizontal or vertical) in a second-order
    response whose local magnitude change exceeds ``min_slope``."""
    r = response
    zc = np.zeros(r.shape, dtype=bool)
    h = (np.sign(r[:, :-1]) != np.sign(r[:, 1:])) & (np.abs(r[:, :-1] - r[:, 1:]) > min_slope)
    v = (np.sign(r[:-1, :]) != np.sign(r[1:, :])) & (np.abs(r[:-1, :] - r[1:, :]) > min_slope)
    zc[:, :-1] |= h
    zc[:-1, :] |= v
    return (zc * 255).astype(np.uint8)


def difference_of_gaussians(gray: np.ndarray, sigma1: float = 1.0, sigma2: float = 2.0) -> np.ndarray:
    """DoG band-pass: G(sigma1) * I - G(sigma2) * I, an efficient LoG approximation."""
    g = gray.astype(np.float32)
    return cv2.GaussianBlur(g, (0, 0), sigma1) - cv2.GaussianBlur(g, (0, 0), sigma2)


def to_display(response: np.ndarray, absolute: bool = True) -> np.ndarray:
    """Scale a float response to 0..255 uint8 for viewing / saving."""
    r = np.abs(response) if absolute else response
    return cv2.normalize(r, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)


def edge_density(edges: np.ndarray, mask: np.ndarray) -> float:
    """Fraction of mask pixels that are edge pixels (a simple texture measure)."""
    n = int(np.count_nonzero(mask))
    if n == 0:
        return 0.0
    return float(np.count_nonzero(edges[mask > 0])) / n
