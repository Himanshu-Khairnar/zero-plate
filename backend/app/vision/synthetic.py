"""Reproducible synthetic waste-plate photos with exact ground truth.

No real photos are downloaded or bundled. Each sample is drawn with numpy /
OpenCV from a seeded RNG:

- a table texture (wood grain, dark slate or beige laminate);
- a white, off-white or grey round plate with a rim ring and a soft shadow;
- 0-4 food portions: irregular blobs in typical Indian-canteen colours
  (dal yellow, gravy red-orange, palak green, roti/chapati brown, biryani
  orange) with their own speckle texture; some pairs are placed touching;
- uneven lighting (linear gradient + vignette), Gaussian sensor noise,
  salt-and-pepper noise.

Ground truth per image: food mask, fill ratio (food area / plate area),
portion count, per-portion areas, plate circle.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

H, W = 480, 640

FOODS = {  # name -> BGR base colour, speckle colour
    "dal": ((40, 170, 225), (30, 120, 200)),
    "gravy": ((35, 75, 190), (30, 50, 140)),
    "palak": ((45, 115, 50), (30, 80, 35)),
    "chapati": ((70, 125, 175), (45, 85, 130)),
    "biryani": ((60, 150, 225), (200, 225, 235)),
}

PLATES = {"white": (243, 243, 240), "offwhite": (228, 236, 240), "grey": (196, 198, 202)}


@dataclass
class Sample:
    image: np.ndarray          # BGR uint8
    mask: np.ndarray           # 0/255 food mask (inside plate)
    plate: tuple[float, float, float]  # cx, cy, r
    fill_ratio: float
    portion_count: int
    portion_areas: list[int]
    foods: list[str]
    touching: bool
    meta: dict


def _table(rng: np.random.Generator, kind: str) -> np.ndarray:
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    noise = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 3)
    if kind == "wood":
        grain = np.sin(yy / rng.uniform(6, 12) + 3 * np.sin(xx / rng.uniform(60, 120))) * 0.5 + 0.5
        base = np.array([40, 82, 135], np.float32) * (0.75 + 0.35 * grain[..., None]) + 8 * noise[..., None]
    elif kind == "slate":
        base = np.array([62, 60, 58], np.float32) + 10 * noise[..., None]
    else:  # laminate
        base = np.array([150, 172, 194], np.float32) + 6 * noise[..., None]
    return np.clip(base, 0, 255)


def _blob(rng: np.random.Generator, cx: float, cy: float, r: float) -> np.ndarray:
    """Polygon of an irregular, slightly elongated blob (radius r on average)."""
    t = np.linspace(0, 2 * np.pi, 120, endpoint=False)
    rad = np.ones_like(t)
    for k, amp in ((2, 0.07), (3, 0.05), (5, 0.03)):
        rad += amp * rng.uniform(0.3, 1.0) * np.sin(k * t + rng.uniform(0, 2 * np.pi))
    rot = rng.uniform(0, np.pi)
    elong = rng.uniform(1.0, 1.25)
    x = r * rad * np.cos(t) * elong
    y = r * rad * np.sin(t) / elong
    xr = x * np.cos(rot) - y * np.sin(rot) + cx
    yr = x * np.sin(rot) + y * np.cos(rot) + cy
    return np.stack([xr, yr], 1).round().astype(np.int32)


def _place_portions(rng, pcx, pcy, R, n, touching):
    """Centres and radii of n portions inside 0.82 R of the plate. If
    ``touching``, the second portion is placed against the first."""
    out: list[tuple[float, float, float]] = []
    tries = 0
    while len(out) < n and tries < 500:
        tries += 1
        r = rng.uniform(0.20, 0.36) * R if n <= 2 else rng.uniform(0.15, 0.25) * R
        if touching and len(out) == 1:
            x0, y0, r0 = out[0]
            ang = rng.uniform(0, 2 * np.pi)
            d = rng.uniform(0.85, 0.95) * (r0 + r)
            cx, cy = x0 + d * np.cos(ang), y0 + d * np.sin(ang)
        else:
            ang, rr = rng.uniform(0, 2 * np.pi), rng.uniform(0, 0.82 * R - r * 1.25)
            if rr < 0:
                continue
            cx, cy = pcx + rr * np.cos(ang), pcy + rr * np.sin(ang)
        if np.hypot(cx - pcx, cy - pcy) + r * 1.3 > 0.85 * R:
            continue
        ok = True
        for i, (x, y, q) in enumerate(out):
            gap = np.hypot(cx - x, cy - y) / (q + r)
            if touching and len(out) == 1 and i == 0:
                continue
            if gap < 1.3:
                ok = False
                break
        if ok:
            out.append((cx, cy, r))
    return out


def make_sample(seed: int) -> Sample:
    rng = np.random.default_rng(seed)
    table_kind = ["wood", "slate", "laminate"][seed % 3]
    plate_kind = list(PLATES)[(seed // 3) % 3]
    img = _table(rng, table_kind)

    R = rng.uniform(0.36, 0.45) * H
    pcx = W / 2 + rng.uniform(-0.08, 0.08) * W
    pcy = H / 2 + rng.uniform(-0.05, 0.05) * H
    # soft drop shadow, plate disc, rim ring
    shadow = np.zeros((H, W), np.float32)
    cv2.circle(shadow, (int(pcx + 8), int(pcy + 10)), int(R), 1.0, -1)
    shadow = cv2.GaussianBlur(shadow, (0, 0), 9)
    img *= (1 - 0.35 * shadow[..., None])
    plate_col = np.array(PLATES[plate_kind], np.float32)
    disc = np.zeros((H, W), np.uint8)
    cv2.circle(disc, (int(round(pcx)), int(round(pcy))), int(round(R)), 255, -1, cv2.LINE_AA)
    img[disc > 0] = plate_col
    cv2.circle(img, (int(round(pcx)), int(round(pcy))), int(round(R * 0.86)), (plate_col * 0.95).tolist(), 2, cv2.LINE_AA)

    n = int(rng.choice([0, 1, 1, 2, 2, 3, 3, 4], p=[0.05, 0.15, 0.1, 0.2, 0.15, 0.15, 0.1, 0.1]))
    touching = n >= 2 and rng.random() < 0.45
    centres = _place_portions(rng, pcx, pcy, R, n, touching)
    names = list(FOODS)
    mask = np.zeros((H, W), np.uint8)
    areas, foods = [], []
    for cx, cy, r in centres:
        food = names[int(rng.integers(len(names)))]
        foods.append(food)
        base, speck = (np.array(c, np.float32) for c in FOODS[food])
        poly = _blob(rng, cx, cy, r)
        m = np.zeros((H, W), np.uint8)
        cv2.fillPoly(m, [poly], 255)
        m &= disc
        tex = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 2.5)
        layer = base[None, None, :] * (1 + 0.10 * tex[..., None])
        specks = rng.random((H, W)) < 0.03
        layer[specks] = speck
        sel = m > 0
        img[sel] = layer[sel]
        areas.append(int(np.count_nonzero(m & ~mask)))
        mask |= m

    # uneven lighting: linear gradient + vignette
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = rng.uniform(0, 2 * np.pi)
    g = rng.uniform(0.10, 0.30)
    grad = 1 + g * (((xx - W / 2) * np.cos(a) + (yy - H / 2) * np.sin(a)) / (W / 2))
    vig = 1 - 0.18 * (((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2) * 4
    img *= (grad * vig)[..., None]
    # sensor noise + salt & pepper
    img += rng.normal(0, rng.uniform(3, 8), img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)
    sp = rng.random((H, W))
    p = rng.uniform(0.001, 0.005)
    img[sp < p / 2] = 0
    img[sp > 1 - p / 2] = 255

    plate_area = float(np.count_nonzero(disc))
    return Sample(
        image=img, mask=mask, plate=(float(pcx), float(pcy), float(R)),
        fill_ratio=float(np.count_nonzero(mask)) / plate_area, portion_count=len(centres),
        portion_areas=sorted(areas, reverse=True), foods=foods, touching=touching and len(centres) >= 2,
        meta={"seed": seed, "table": table_kind, "plate": plate_kind, "lightGradient": round(g, 3)},
    )


def make_dataset(n: int = 60, seed: int = 2026) -> list[Sample]:
    """``n`` samples with seeds ``seed .. seed + n - 1`` (fully reproducible)."""
    return [make_sample(seed + i) for i in range(n)]
