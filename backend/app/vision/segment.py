"""Units 2, 3 and 5 - segmentation.

plate ROI (Hough circle / largest contour) -> food cue (Lab colour distance
from the plate) -> Otsu global threshold -> morphological clean-up ->
distance transform + watershed to split touching portions -> connected
components to count them.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

MIN_CUE = 22.0          # Lab distance below which a pixel is "plate" whatever Otsu says
CUE_SCALE = 1.5         # Lab distance -> uint8 cue units
ROI_SHRINK = 0.95       # ignore the outermost rim / shadow of the plate
MIN_SEGMENT_FRAC = 0.004  # segments smaller than 0.4 % of the plate are noise


@dataclass
class Plate:
    cx: float
    cy: float
    r: float
    method: str  # "hough" | "contour" | "frame"

    @property
    def area(self) -> float:
        return float(np.pi * self.r ** 2)

    def as_dict(self) -> dict:
        return {"cx": round(self.cx, 1), "cy": round(self.cy, 1), "r": round(self.r, 1), "method": self.method}


# --------------------------------------------------------------------------- plate / ROI

def _rim_support(edges: np.ndarray, cx: float, cy: float, r: float, samples: int = 180) -> float:
    """Share of points on the circle that have an edge pixel within 2 px."""
    near = cv2.dilate(edges, np.ones((5, 5), np.uint8))
    t = np.linspace(0, 2 * np.pi, samples, endpoint=False)
    xs = np.clip(np.round(cx + r * np.cos(t)).astype(int), 0, edges.shape[1] - 1)
    ys = np.clip(np.round(cy + r * np.sin(t)).astype(int), 0, edges.shape[0] - 1)
    inside = (cx + r * np.cos(t) >= 0) & (cx + r * np.cos(t) < edges.shape[1]) & \
             (cy + r * np.sin(t) >= 0) & (cy + r * np.sin(t) < edges.shape[0])
    return float(np.mean((near[ys, xs] > 0) & inside))


def detect_plate_hough(gray: np.ndarray) -> Plate | None:
    """Circular Hough transform on a median-blurred grey image. Among the
    strongest candidates, keep the largest circle whose circumference is well
    supported by Canny edges (a plate's inner rim gives a smaller second circle)."""
    h, w = gray.shape
    m = min(h, w)
    blur = cv2.medianBlur(gray, 5)
    circles = cv2.HoughCircles(blur, cv2.HOUGH_GRADIENT, dp=1.2, minDist=m * 0.5, param1=120, param2=45,
                               minRadius=int(m * 0.22), maxRadius=int(m * 0.62))
    if circles is None:
        return None
    edges = cv2.Canny(blur, 40, 120)
    cands = []
    for cx, cy, r in circles[0][:8]:
        cands.append((_rim_support(edges, cx, cy, r), float(cx), float(cy), float(r)))
    best = max(c[0] for c in cands)
    # The rim must be far better supported than chance: in a cluttered or noisy
    # frame, any circle lands near an edge pixel with probability ~ background.
    background = float(np.mean(cv2.dilate(edges, np.ones((5, 5), np.uint8)) > 0))
    if best < 0.45 or best < 1.6 * background:
        return None
    good = [c for c in cands if c[0] >= 0.8 * best]
    s, cx, cy, r = max(good, key=lambda c: c[3])
    return Plate(cx, cy, r, "hough")


def detect_plate_contour(bgr: np.ndarray) -> Plate | None:
    """Fallback: plates are bright and unsaturated. Otsu-threshold a
    'plate-likeness' map (V - S), take the largest external contour (holes from
    food filled), and fit its minimum enclosing circle."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    score = cv2.subtract(hsv[..., 2], hsv[..., 1])
    _, th = cv2.threshold(score, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    c = max(contours, key=cv2.contourArea)
    (cx, cy), r = cv2.minEnclosingCircle(c)
    area = cv2.contourArea(c)
    m = min(bgr.shape[:2])
    if r < 0.15 * m or area < 0.5 * np.pi * r * r:
        return None
    return Plate(float(cx), float(cy), float(r), "contour")


def detect_plate(bgr: np.ndarray, gray: np.ndarray) -> Plate:
    """Plate region of interest: Hough circle, else largest contour, else the
    whole frame (e.g. a tray or bin photo with no round plate)."""
    p = detect_plate_hough(gray) or detect_plate_contour(bgr)
    if p is not None:
        return p
    h, w = gray.shape
    return Plate(w / 2, h / 2, min(h, w) / 2, "frame")


def plate_mask(shape: tuple[int, int], plate: Plate, shrink: float = ROI_SHRINK) -> np.ndarray:
    """Binary disc (255 inside) for the plate ROI."""
    m = np.zeros(shape[:2], np.uint8)
    if plate.method == "frame":
        m[:] = 255
        return m
    cv2.circle(m, (round(plate.cx), round(plate.cy)), max(1, round(plate.r * shrink)), 255, -1)
    return m


def plate_area_px(shape: tuple[int, int], plate: Plate) -> float:
    """Plate area in pixels, clipped to the frame."""
    if plate.method == "frame":
        return float(shape[0] * shape[1])
    m = np.zeros(shape[:2], np.uint8)
    cv2.circle(m, (round(plate.cx), round(plate.cy)), max(1, round(plate.r)), 255, -1)
    return float(np.count_nonzero(m))


# --------------------------------------------------------------------------- food cue + Otsu

def plate_reference_colour(lab: np.ndarray, hsv: np.ndarray, plate: Plate, roi: np.ndarray) -> np.ndarray:
    """Median Lab colour of the bare plate, read from the least saturated half
    of an annulus near the rim (food is rarely piled against the rim)."""
    h, w = roi.shape
    yy, xx = np.mgrid[0:h, 0:w]
    if plate.method == "frame":
        ring = roi > 0
    else:
        d = np.hypot(xx - plate.cx, yy - plate.cy)
        ring = (d > 0.72 * plate.r) & (d < 0.92 * plate.r) & (roi > 0)
    if np.count_nonzero(ring) < 50:
        ring = roi > 0
    s = hsv[..., 1][ring]
    keep = s <= np.percentile(s, 50)
    return np.median(lab[ring][keep], axis=0).astype(np.float32)


def food_cue(lab: np.ndarray, ref: np.ndarray, l_weight: float = 0.6) -> np.ndarray:
    """Per-pixel colour distance from the plate in Lab, with lightness
    down-weighted (residual shading lives in L). Returned as uint8."""
    d = lab.astype(np.float32) - ref[None, None, :]
    dist = np.sqrt((l_weight * d[..., 0]) ** 2 + d[..., 1] ** 2 + d[..., 2] ** 2)
    return np.clip(dist * CUE_SCALE, 0, 255).astype(np.uint8)


def otsu_threshold(cue: np.ndarray, roi: np.ndarray, floor: float = MIN_CUE) -> tuple[np.ndarray, float]:
    """Otsu's global threshold computed from ROI pixels only (maximises the
    between-class variance of food vs plate), floored so an empty plate
    does not get split into noise. Returns (mask, threshold)."""
    vals = cue[roi > 0].reshape(-1, 1)
    if vals.size == 0:
        return np.zeros_like(cue), float(floor)
    t, _ = cv2.threshold(vals, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    t = max(float(t), floor * CUE_SCALE)
    mask = ((cue > t) & (roi > 0)).astype(np.uint8) * 255
    return mask, t


# --------------------------------------------------------------------------- morphology

def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Fill interior holes by drawing every external contour filled."""
    out = np.zeros_like(mask)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(out, contours, -1, 255, -1)
    return out


def remove_small(mask: np.ndarray, min_area: int) -> np.ndarray:
    """Drop connected components smaller than ``min_area`` pixels."""
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return (keep[lab] * 255).astype(np.uint8)


def clean_mask(mask: np.ndarray, plate_r: float, roi: np.ndarray | None = None) -> np.ndarray:
    """Opening (erosion then dilation) removes specks and thin bridges;
    closing (dilation then erosion) fills gaps inside a portion; then holes
    are filled and tiny components removed. Kernel sizes scale with the plate."""
    k_open = max(3, int(plate_r * 0.03) | 1)
    k_close = max(5, int(plate_r * 0.06) | 1)
    se_o = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_open, k_open))
    se_c = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_close, k_close))
    out = cv2.morphologyEx(mask, cv2.MORPH_OPEN, se_o)
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, se_c)
    out = fill_holes(out)
    if roi is not None:
        out = cv2.bitwise_and(out, roi)
    return remove_small(out, int(MIN_SEGMENT_FRAC * np.pi * plate_r ** 2))


# --------------------------------------------------------------------------- watershed

def distance_map(mask: np.ndarray) -> np.ndarray:
    """Euclidean distance transform: distance of each food pixel to the
    nearest background pixel (peaks sit at portion centres)."""
    return cv2.distanceTransform(mask, cv2.DIST_L2, 5)


def _find(parent: list[int], i: int) -> int:
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def find_markers(dist: np.ndarray, plate_r: float, rel: float = 0.35, saddle: float = 0.84) -> tuple[np.ndarray, int]:
    """Seeds for watershed: local maxima of the distance transform.

    A maximum must exceed ``rel`` x its component's max distance. Two maxima are
    merged when the distance along the straight line between them never drops
    below ``saddle`` x the lower peak (no 'neck' => same portion). Returns
    (markers int32 with labels 1..n, n)."""
    k = max(3, int(plate_r * 0.10) | 1)
    dil = cv2.dilate(dist, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    min_r = max(2.0, plate_r * 0.03)
    peaks = (dist >= dil - 1e-4) & (dist > min_r)
    comp_n, comp = cv2.connectedComponents((dist > 0).astype(np.uint8))
    comp_max = np.zeros(comp_n, np.float32)
    np.maximum.at(comp_max, comp.ravel(), dist.ravel())
    peaks &= dist >= rel * comp_max[comp]
    # collapse plateau pixels into one point per blob of peak pixels
    n, plab, _, cents = cv2.connectedComponentsWithStats(peaks.astype(np.uint8), connectivity=8)
    pts = [(float(cents[i][0]), float(cents[i][1])) for i in range(1, n)]
    vals = [float(dist[int(round(y)), int(round(x))]) for x, y in pts]
    parent = list(range(len(pts)))
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            (x1, y1), (x2, y2) = pts[i], pts[j]
            if comp[int(round(y1)), int(round(x1))] != comp[int(round(y2)), int(round(x2))]:
                continue
            steps = int(max(abs(x2 - x1), abs(y2 - y1))) + 2
            xs = np.round(np.linspace(x1, x2, steps)).astype(int)
            ys = np.round(np.linspace(y1, y2, steps)).astype(int)
            if float(dist[ys, xs].min()) >= saddle * min(vals[i], vals[j]):
                parent[_find(parent, i)] = _find(parent, j)
    roots = sorted({_find(parent, i) for i in range(len(pts))})
    idx = {r: k + 1 for k, r in enumerate(roots)}
    markers = np.zeros(dist.shape, np.int32)
    for i, (x, y) in enumerate(pts):
        r = max(2, int(0.25 * vals[i]))
        cv2.circle(markers, (int(round(x)), int(round(y))), r, idx[_find(parent, i)], -1)
    markers[dist <= 0] = 0
    return markers, len(roots)


def watershed_segments(bgr: np.ndarray, mask: np.ndarray, plate_r: float) -> tuple[np.ndarray, np.ndarray, int]:
    """Marker-controlled watershed on the (smoothed) colour image.

    Seeds come from ``find_markers``; everything outside the mask is the
    background marker. Returns (labels int32 with 0 = background, distance
    map, number of segments)."""
    dist = distance_map(mask)
    seeds, n = find_markers(dist, plate_r)
    if n == 0:
        return np.zeros(mask.shape, np.int32), dist, 0
    markers = seeds + 1                      # 1 = background, 2.. = portions
    markers[(mask > 0) & (seeds == 0)] = 0   # unknown: let watershed decide
    markers[mask == 0] = 1
    ws = cv2.watershed(bgr, markers.copy())
    labels = np.where((ws > 1) & (mask > 0), ws - 1, 0).astype(np.int32)
    return labels, dist, n


def segment_areas(labels: np.ndarray, min_area: int) -> list[int]:
    """Pixel area per watershed segment (descending), noise segments dropped."""
    if labels.max() == 0:
        return []
    counts = np.bincount(labels.ravel())[1:]
    return sorted((int(c) for c in counts if c >= min_area), reverse=True)


def count_components(mask: np.ndarray, min_area: int = 1) -> int:
    """8-connected component count of a binary mask (portions that do not touch)."""
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    return int(np.sum(stats[1:, cv2.CC_STAT_AREA] >= min_area))
