"""Regenerate the IPCV report artefacts in ``docs/ipcv/``.

    cd backend
    python -m app.vision.report            # figures + results.json + results.md + pytest
    python -m app.vision.report --skip-tests

Figures are drawn with OpenCV only (no plotting library needed).
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np

from app.vision import edges, enhance, features, frequency, synthetic
from app.vision.pipeline import analyse

REPO = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO / "docs" / "ipcv"
DEV_SEED, DEV_N = 2026, 60          # thresholds were tuned on this range
TEST_SEED, TEST_N = 5000, 120       # held-out evaluation range
FIG_SAMPLES = {"sample_a": 2027, "sample_b": 2028, "sample_c": 2032}
FONT = cv2.FONT_HERSHEY_SIMPLEX
PALETTE = [(66, 133, 244), (52, 168, 83), (251, 188, 5), (234, 67, 53), (171, 71, 188), (0, 172, 193)]


# --------------------------------------------------------------------------- drawing helpers

def _bgr(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) if img.ndim == 2 else img


def titled(img: np.ndarray, title: str, scale: float = 1.0) -> np.ndarray:
    """Image with a white title bar on top."""
    img = _bgr(img)
    if scale != 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST if scale > 1 else cv2.INTER_AREA)
    bar = np.full((34, img.shape[1], 3), 255, np.uint8)
    cv2.putText(bar, title, (8, 23), FONT, 0.6, (20, 20, 20), 1, cv2.LINE_AA)
    return np.vstack([bar, img])


def grid(tiles: list[np.ndarray], cols: int, pad: int = 8) -> np.ndarray:
    h = max(t.shape[0] for t in tiles)
    w = max(t.shape[1] for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    out = np.full((rows * (h + pad) + pad, cols * (w + pad) + pad, 3), 255, np.uint8)
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        t = _bgr(t)
        out[pad + r * (h + pad):pad + r * (h + pad) + t.shape[0], pad + c * (w + pad):pad + c * (w + pad) + t.shape[1]] = t
    return out


def colormap(x: np.ndarray, cmap: int = cv2.COLORMAP_VIRIDIS) -> np.ndarray:
    return cv2.applyColorMap(edges.to_display(x.astype(np.float32), absolute=False), cmap)


def plot_histograms(series: list[tuple[str, np.ndarray, tuple[int, int, int]]], title: str,
                    vline: float | None = None, size: tuple[int, int] = (720, 360), log: bool = False) -> np.ndarray:
    """Line plot of 256-bin histograms with axes, legend and optional threshold line
    (``log``: y axis is log10(1 + count), so small modes stay visible)."""
    if log:
        series = [(n, np.log10(1 + s), c) for n, s, c in series]
    W, H = size
    left, right, top, bottom = 60, 20, 40, 45
    img = np.full((H, W, 3), 255, np.uint8)
    pw, ph = W - left - right, H - top - bottom
    cv2.rectangle(img, (left, top), (left + pw, top + ph), (90, 90, 90), 1)
    ymax = max(float(s.max()) for _, s, _ in series) or 1.0
    for x in range(0, 256, 32):
        px = left + int(x / 255 * pw)
        cv2.line(img, (px, top + ph), (px, top + ph + 5), (90, 90, 90), 1)
        cv2.putText(img, str(x), (px - 10, top + ph + 20), FONT, 0.4, (60, 60, 60), 1, cv2.LINE_AA)
    cv2.putText(img, "intensity", (left + pw // 2 - 30, H - 8), FONT, 0.45, (60, 60, 60), 1, cv2.LINE_AA)
    cv2.putText(img, "log count" if log else "count", (5, top + 12), FONT, 0.45, (60, 60, 60), 1, cv2.LINE_AA)
    cv2.putText(img, title, (left, 26), FONT, 0.6, (20, 20, 20), 1, cv2.LINE_AA)
    for i, (name, s, col) in enumerate(series):
        pts = np.array([[left + int(x / 255 * pw), top + ph - int(float(v) / ymax * ph)] for x, v in enumerate(s)], np.int32)
        cv2.polylines(img, [pts], False, col, 2, cv2.LINE_AA)
        ly = top + 18 + 20 * i
        cv2.line(img, (left + pw - 190, ly - 4), (left + pw - 165, ly - 4), col, 3)
        cv2.putText(img, name, (left + pw - 158, ly), FONT, 0.45, (40, 40, 40), 1, cv2.LINE_AA)
    if vline is not None:
        px = left + int(vline / 255 * pw)
        cv2.line(img, (px, top), (px, top + ph), (0, 0, 220), 2)
        cv2.putText(img, f"Otsu t={vline:.0f}", (px + 5, top + ph - 10), FONT, 0.45, (0, 0, 220), 1, cv2.LINE_AA)
    return img


def overlay_labels(img: np.ndarray, labels: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    out = img.copy()
    for k in range(1, int(labels.max()) + 1):
        sel = labels == k
        if not sel.any():
            continue
        col = np.array(PALETTE[(k - 1) % len(PALETTE)], np.float32)
        out[sel] = (out[sel] * (1 - alpha) + col * alpha).astype(np.uint8)
        cnts, _ = cv2.findContours(sel.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(out, cnts, -1, (255, 255, 255), 2)
    return out


def annotate(img: np.ndarray, r) -> np.ndarray:
    out = overlay_labels(img, r.labels, 0.35)
    p = r.plate
    cv2.circle(out, (int(p.cx), int(p.cy)), int(p.r), (0, 220, 255), 2, cv2.LINE_AA)
    for k in range(1, int(r.labels.max()) + 1):
        ys, xs = np.nonzero(r.labels == k)
        if xs.size:
            cv2.putText(out, str(k), (int(xs.mean()) - 6, int(ys.mean()) + 6), FONT, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    lines = [f"fill ratio {r.fill_ratio:.3f}", f"portions {r.portion_count}",
             f"colour {r.dominant_colour['name']}", f"plate: {p.method}"]
    for i, t in enumerate(lines):
        cv2.putText(out, t, (10, 24 + 24 * i), FONT, 0.6, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(out, t, (10, 24 + 24 * i), FONT, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    return out


# --------------------------------------------------------------------------- figures

def stage_figures(sample: synthetic.Sample, out: Path) -> dict[str, str]:
    """Write one PNG per stage for one sample; returns {stage: relative path}."""
    out.mkdir(parents=True, exist_ok=True)
    r = analyse(sample.image, keep_stages=True)
    s = r.stages
    img, den, enh = s["input"], s["denoised"], s["enhanced"]
    gray_in, gray_den = enhance.to_gray(img), enhance.to_gray(den)
    files: dict[str, np.ndarray] = {}

    files["01_original"] = titled(img, "Input (resized to 512 px long side)")
    # zoomed crop shows the salt-and-pepper / sensor noise removal
    cy, cx = int(r.plate.cy), int(r.plate.cx)
    y0, x0 = max(0, cy - 60), max(0, cx - 60)
    crop = lambda a: cv2.resize(a[y0:y0 + 120, x0:x0 + 120], (360, 360), interpolation=cv2.INTER_NEAREST)
    files["02_denoise"] = grid([titled(img, "Noisy input"), titled(den, "Median 5x5 + Gaussian 5x5"),
                                titled(crop(img), "Input (3x zoom)"), titled(crop(den), "Denoised (3x zoom)")], 2)
    files["03_clahe"] = grid([titled(den, "Denoised"), titled(enh, "CLAHE on Lab L (clip 2, 8x8 tiles)"),
                              titled(enhance.equalize_histogram(gray_den), "Global histogram equalisation (grey)"),
                              titled(enhance.to_gray(enh), "CLAHE result (grey)")], 2)
    files["04_histograms"] = plot_histograms([
        ("denoised", enhance.histogram(gray_den), (150, 150, 150)),
        ("global HE", enhance.histogram(enhance.equalize_histogram(gray_den)), (234, 67, 53)),
        ("CLAHE", enhance.histogram(enhance.to_gray(enh)), (66, 133, 244)),
    ], "Grey-level histograms before / after equalisation")
    files["05_stretch_highboost"] = grid([
        titled(enhance.contrast_stretch(gray_den), "Contrast stretch (2-98 percentile)"),
        titled(enhance.high_boost(gray_den, 1.5), "High-boost sharpening (k = 1.5)")], 2)
    files["06_sobel"] = titled(colormap(s["sobel"], cv2.COLORMAP_INFERNO), "Sobel gradient magnitude")
    files["07_canny"] = titled(s["canny"], f"Canny (auto thresholds {r.measures['cannyThresholds']})")
    files["08_log"] = grid([titled(edges.to_display(s["log"]), "|LoG| sigma = 2"),
                            titled(edges.zero_crossings(s["log"], 2.0), "LoG zero crossings")], 2)
    files["09_dog"] = titled(edges.to_display(s["dog"]), "|DoG| sigma 1 - sigma 2")
    files["06-09_edges_grid"] = grid([files["06_sobel"], files["07_canny"],
                                      titled(edges.to_display(s["log"]), "|LoG| sigma = 2"), files["09_dog"]], 2)
    plate_img = den.copy()
    cv2.circle(plate_img, (int(r.plate.cx), int(r.plate.cy)), int(r.plate.r), (0, 220, 255), 3, cv2.LINE_AA)
    cv2.circle(plate_img, (int(r.plate.cx), int(r.plate.cy)), 4, (0, 0, 255), -1)
    files["10_plate_detection"] = titled(plate_img, f"Plate ROI by Hough circle transform (r = {r.plate.r:.0f} px)")
    files["11_dft_spectrum"] = titled(frequency.dft_magnitude(s["lab"][..., 0]), "DFT log-magnitude spectrum of L")
    files["12_illumination_lowpass"] = grid([
        titled(s["lab"][..., 0], "L channel (uneven light)"),
        titled(colormap(s["illumination"]), "Gaussian low-pass (D0 = 3): shading"),
        titled(s["lab_flat"][..., 0], "L / shading  (flattened)")], 3)
    files["13_food_cue"] = titled(colormap(s["cue"], cv2.COLORMAP_INFERNO), "Food cue: Lab distance from plate colour")
    roi = s["roi"]
    files["14_otsu_histogram"] = plot_histograms([("cue in plate ROI", enhance.histogram(s["cue"], roi), (66, 133, 244))],
                                                 "Food-cue histogram inside the plate (log scale)", vline=r.measures["otsuThreshold"], log=True)
    files["15_otsu_mask"] = titled(s["raw_mask"], "Otsu global threshold")
    files["16_morphology"] = grid([titled(s["raw_mask"], "Before: raw Otsu mask"),
                                   titled(s["mask"], "After: open + close + fill holes")], 2)
    files["17_distance_transform"] = titled(colormap(s["dist"], cv2.COLORMAP_JET), "Euclidean distance transform")
    files["18_watershed"] = titled(overlay_labels(den, s["labels"]), f"Watershed segments: {r.portion_count} portions "
                                                                       f"({r.measures['connectedComponents']} connected comp.)")
    hog_vis = features.hog_visualise(s["hog_cells"], 16, 3)
    files["19_hog"] = grid([titled(s["roi_gray"], "Rotation-normalised ROI 128x128", 3.0),
                            titled(hog_vis, "HOG cells (16 px, 9 bins)")], 2)
    pyr = features.gaussian_pyramid(s["roi_img"], 3)
    files["20_pyramid"] = grid([titled(cv2.resize(p, (256 // (2 ** i), 256 // (2 ** i)), interpolation=cv2.INTER_NEAREST),
                                       f"L{i} {p.shape[1]}px") for i, p in enumerate(pyr)], 3)
    rle = r.mask_rle
    rle_img = titled(s["roi_mask"], f"RLE: {rle['runs']} runs, {rle['rleBytes']} B vs {rle['bitmapBytes']} B bitmap", 3.0)
    files["21_rle_mask"] = rle_img
    files["22_final_annotated"] = titled(annotate(den, r), "Result")
    files["00_overview"] = grid([titled(cv2.resize(_bgr(x), (320, 240)), t) for x, t in [
        (img, "1 input"), (enh, "2 denoise + CLAHE"), (plate_img, "3 plate (Hough)"),
        (s["lab_flat"][..., 0], "4 DFT illumination flat"), (colormap(s["cue"], cv2.COLORMAP_INFERNO), "5 food cue"),
        (s["raw_mask"], "6 Otsu"), (s["mask"], "7 morphology"), (colormap(s["dist"], cv2.COLORMAP_JET), "8 distance"),
        (annotate(den, r), "9 watershed result")]], 3)

    paths = {}
    for name, im in files.items():
        p = out / f"{name}.png"
        cv2.imwrite(str(p), im, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        paths[name] = p.relative_to(out.parent.parent).as_posix()
    return paths


def dataset_figure(out: Path) -> None:
    ds = synthetic.make_dataset(12, seed=DEV_SEED)
    tiles = [titled(cv2.resize(s.image, (320, 240), interpolation=cv2.INTER_AREA),
                    f"fill {s.fill_ratio:.2f}  n={s.portion_count}{'  touching' if s.touching else ''}") for s in ds]
    cv2.imwrite(str(out / "dataset_samples.png"), grid(tiles, 4), [cv2.IMWRITE_PNG_COMPRESSION, 9])


# --------------------------------------------------------------------------- metrics

def evaluate(seed: int, n: int, flatten_light: bool = True) -> dict:
    ds = synthetic.make_dataset(n, seed=seed)
    analyse(ds[0].image)  # warm-up (FFT plans, OpenCV dispatch)
    rows, timings = [], []
    for smp in ds:
        r = analyse(smp.image, flatten_light=flatten_light)
        sc = r.measures["scale"]
        cx, cy, R = smp.plate
        rows.append({
            "seed": smp.meta["seed"], "table": smp.meta["table"], "plate": smp.meta["plate"], "touching": smp.touching,
            "fillGt": smp.fill_ratio, "fillEst": r.fill_ratio, "countGt": smp.portion_count, "countEst": r.portion_count,
            "components": r.measures["connectedComponents"],
            "plateRadiusErr": abs(r.plate.r / sc - R) / R,
            "plateCentreErr": float(np.hypot(r.plate.cx / sc - cx, r.plate.cy / sc - cy) / R),
            "plateMethod": r.plate.method,
            "rleBytes": r.mask_rle["fullResolution"]["rleBytes"],
            "bitmapBytes": r.mask_rle["fullResolution"]["bitmapBytes"],
            "rawBytes": r.shape[0] * r.shape[1],
            "rleRatio": r.mask_rle["fullResolution"]["ratioVsBitmap"],
        })
        timings.append(r.timings_ms)

    def summary(sel: list[dict]) -> dict:
        if not sel:
            return {}
        fe = np.array([abs(x["fillEst"] - x["fillGt"]) for x in sel])
        return {
            "n": len(sel),
            "fillRatioMAE": round(float(fe.mean()), 5),
            "fillRatioMaxAbsErr": round(float(fe.max()), 5),
            "portionCountAccuracy": round(float(np.mean([x["countEst"] == x["countGt"] for x in sel])), 4),
            "portionCountMAE": round(float(np.mean([abs(x["countEst"] - x["countGt"]) for x in sel])), 4),
            "connectedComponentsOnlyAccuracy": round(float(np.mean([x["components"] == x["countGt"] for x in sel])), 4),
        }

    stages = list(timings[0])
    stage_ms = {k: round(float(np.mean([t[k] for t in timings])), 2) for k in stages}
    return {
        "seedRange": [seed, seed + n - 1],
        "overall": summary(rows),
        "byTable": {k: summary([x for x in rows if x["table"] == k]) for k in ("wood", "slate", "laminate")},
        "byPlate": {k: summary([x for x in rows if x["plate"] == k]) for k in synthetic.PLATES},
        "touching": summary([x for x in rows if x["touching"]]),
        "notTouching": summary([x for x in rows if not x["touching"]]),
        "plateDetection": {
            "houghRate": round(float(np.mean([x["plateMethod"] == "hough" for x in rows])), 4),
            "radiusRelErrMean": round(float(np.mean([x["plateRadiusErr"] for x in rows])), 4),
            "centreErrMeanFracOfRadius": round(float(np.mean([x["plateCentreErr"] for x in rows])), 4),
        },
        "rle": {
            # aggregate ratios (total bytes / total bytes) so near-empty masks do not dominate
            "totalRleBytes": int(sum(x["rleBytes"] for x in rows)),
            "ratioVsBitmap": round(sum(x["bitmapBytes"] for x in rows) / sum(x["rleBytes"] for x in rows), 2),
            "ratioVs8bit": round(sum(x["rawBytes"] for x in rows) / sum(x["rleBytes"] for x in rows), 2),
            "medianRatioVsBitmap": round(float(np.median([x["rleRatio"] for x in rows])), 2),
            "meanRleBytesPerImage": round(float(np.mean([x["rleBytes"] for x in rows])), 1),
        },
        "stageMeanMs": stage_ms,
        "pipelineMeanMs": round(float(np.mean([sum(t.values()) for t in timings])), 2),
        "failures": [{k: (round(v, 4) if isinstance(v, float) else v) for k, v in x.items()} for x in rows
                     if x["countEst"] != x["countGt"] or abs(x["fillEst"] - x["fillGt"]) > 0.02],
    }


def endpoint_latency(n: int = 20) -> dict:
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payloads = []
    for smp in synthetic.make_dataset(n, seed=9000):
        ok, buf = cv2.imencode(".jpg", smp.image, [cv2.IMWRITE_JPEG_QUALITY, 90])
        payloads.append((buf.tobytes(), smp))
    client.post("/api/vision/recognize", files={"image": ("w.jpg", payloads[0][0], "image/jpeg")})  # warm-up
    lat, fill_err, count_ok = [], [], 0
    for data, smp in payloads:
        t0 = time.perf_counter()
        res = client.post("/api/vision/recognize", files={"image": ("p.jpg", data, "image/jpeg")})
        lat.append((time.perf_counter() - t0) * 1000)
        f = res.json()["features"]
        fill_err.append(abs(f["fillRatio"] - smp.fill_ratio))
        count_ok += f["portionCount"] == smp.portion_count
    return {
        "requests": n, "format": "JPEG q90, 640x480", "outletId": None,
        "meanMs": round(float(np.mean(lat)), 1), "p50Ms": round(float(np.percentile(lat, 50)), 1),
        "p95Ms": round(float(np.percentile(lat, 95)), 1),
        "fillRatioMAEviaJpeg": round(float(np.mean(fill_err)), 5), "portionCountAccuracyViaJpeg": round(count_ok / n, 4),
        "largePhoto": _large_photo_latency(client),
    }


def _large_photo_latency(client, n: int = 10) -> dict:
    """12 MP (4000x3000) JPEG uploads: checks the reduced-size decode path."""
    big = cv2.resize(synthetic.make_sample(2027).image, (4000, 3000), interpolation=cv2.INTER_LINEAR)
    ok, buf = cv2.imencode(".jpg", big, [cv2.IMWRITE_JPEG_QUALITY, 90])
    data = buf.tobytes()
    lat = []
    for _ in range(n):
        t0 = time.perf_counter()
        res = client.post("/api/vision/recognize", files={"image": ("big.jpg", data, "image/jpeg")})
        lat.append((time.perf_counter() - t0) * 1000)
        assert res.status_code == 200
    return {"requests": n, "format": "JPEG q90, 4000x3000", "bytes": len(data),
            "p50Ms": round(float(np.percentile(lat, 50)), 1), "p95Ms": round(float(np.percentile(lat, 95)), 1)}


def run_tests() -> dict:
    backend = Path(__file__).resolve().parents[2]
    proc = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"], cwd=backend,
                          capture_output=True, text=True)
    tail = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else proc.stderr[-300:]
    counts = {k: int(v) for v, k in re.findall(r"(\d+) (passed|failed|skipped|error|errors)", tail)}
    vision = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider",
                             "tests/test_vision_pipeline.py", "tests/test_vision.py"], cwd=backend,
                            capture_output=True, text=True)
    vtail = vision.stdout.strip().splitlines()[-1] if vision.stdout.strip() else ""
    vcounts = {k: int(v) for v, k in re.findall(r"(\d+) (passed|failed|skipped|error|errors)", vtail)}
    return {"fullSuite": {"summary": tail, **counts}, "visionTests": {"summary": vtail, **vcounts}}


# --------------------------------------------------------------------------- write

def write_markdown(res: dict, path: Path) -> None:
    d, t, e = res["dev"], res["test"], res["endpoint"]
    o = t["overall"]
    L = [
        "# Zero Plate - Module H: classical CV pipeline results",
        "",
        f"Generated by `python -m app.vision.report` on {res['generatedAt']}. All numbers come from the",
        "synthetic dataset in `backend/app/vision/synthetic.py` (seeded, no downloaded photos). Real",
        "kitchen photos have not been evaluated: there is no labelled real dataset yet.",
        "",
        "## Dataset",
        "",
        f"- Image size {res['dataset']['imageSize']}, tables: wood / slate / laminate, plates: white / off-white / grey.",
        "- 0-4 portions per plate (dal, gravy, palak, chapati, biryani colours), ~45 % of multi-portion plates have a touching pair.",
        "- Uneven lighting (gradient 10-30 % + vignette), Gaussian noise sigma 3-8, salt-and-pepper 0.1-0.5 %.",
        f"- Development set (thresholds tuned here): seeds {d['seedRange'][0]}-{d['seedRange'][1]} ({d['overall']['n']} images).",
        f"- Held-out test set: seeds {t['seedRange'][0]}-{t['seedRange'][1]} ({o['n']} images).",
        "",
        "## Accuracy",
        "",
        "| Set | Images | Fill-ratio MAE | Max abs err | Portion count accuracy | Count MAE | Connected components only |",
        "|---|---|---|---|---|---|---|",
    ]
    for name, block in (("Development", d), ("Held-out test", t)):
        b = block["overall"]
        L.append(f"| {name} | {b['n']} | {b['fillRatioMAE']:.4f} | {b['fillRatioMaxAbsErr']:.4f} | "
                 f"{b['portionCountAccuracy'] * 100:.1f} % | {b['portionCountMAE']:.3f} | {b['connectedComponentsOnlyAccuracy'] * 100:.1f} % |")
    L += ["", "Held-out breakdown:", "", "| Subset | Images | Fill MAE | Count accuracy |", "|---|---|---|---|"]
    for label, b in ([("touching portions", t["touching"]), ("no touching", t["notTouching"])]
                     + [(f"table: {k}", v) for k, v in t["byTable"].items()]
                     + [(f"plate: {k}", v) for k, v in t["byPlate"].items()]):
        if b:
            L.append(f"| {label} | {b['n']} | {b['fillRatioMAE']:.4f} | {b['portionCountAccuracy'] * 100:.1f} % |")
    pd_ = t["plateDetection"]
    L += [
        "",
        f"Plate detection (held-out): Hough circle found on {pd_['houghRate'] * 100:.0f} % of images, mean radius error "
        f"{pd_['radiusRelErrMean'] * 100:.2f} %, mean centre error {pd_['centreErrMeanFracOfRadius'] * 100:.2f} % of the radius.",
        "",
        f"Watershed vs plain connected components: counting connected components alone gets "
        f"{o['connectedComponentsOnlyAccuracy'] * 100:.1f} % of portion counts right; distance transform + watershed gets "
        f"{o['portionCountAccuracy'] * 100:.1f} %.",
        "",
        "## Runtime per stage (held-out set, mean ms per image, 512 px working size)",
        "",
        "| Stage | Mean ms |",
        "|---|---|",
    ]
    L += [f"| {k} | {v:.2f} |" for k, v in t["stageMeanMs"].items()]
    L += [f"| **total** | **{t['pipelineMeanMs']:.2f}** |", "",
          "## Endpoint", "",
          f"`POST /api/vision/recognize`, {e['requests']} requests ({e['format']}, no outlet so no DB query): "
          f"mean {e['meanMs']} ms, p50 {e['p50Ms']} ms, p95 {e['p95Ms']} ms. Through JPEG compression the fill-ratio MAE is "
          f"{e['fillRatioMAEviaJpeg']:.4f} and portion-count accuracy {e['portionCountAccuracyViaJpeg'] * 100:.1f} %.",
          "",
          f"Large phone photos ({e['largePhoto']['format']}, {e['largePhoto']['bytes'] // 1024} KB): p50 "
          f"{e['largePhoto']['p50Ms']} ms, p95 {e['largePhoto']['p95Ms']} ms (decoded at reduced size via JPEG DCT scaling, "
          f"then normalised to 512 px).",
          "",
          "Robustness: the endpoint returns 200 with the same keys for a photo with no plate, an all-black frame, an 8x8 image,"
          " a 4000x3000 photo and a PNG with alpha; any exception inside the pipeline falls back to the original"
          " heuristic-v0 colour statistics (covered by tests).",
          "",
          "## Ablation: DFT illumination flattening", "",
          f"Held-out set without the low-pass illumination correction: fill MAE {res['ablationNoIlluminationFlattening']['fillRatioMAE']:.4f}, "
          f"count accuracy {res['ablationNoIlluminationFlattening']['portionCountAccuracy'] * 100:.1f} % "
          f"(with it: {o['fillRatioMAE']:.4f}, {o['portionCountAccuracy'] * 100:.1f} %). The shading field is estimated only from"
          " neutral (low-chroma) plate pixels so food does not pull it down. The effect is small either way because the food cue already"
          " down-weights lightness, and the synthetic lighting (linear gradient + vignette) is milder than real kitchen shadows.",
          "",
          "## Compression (Unit 6)", "",
          f"Run-length encoding of the full-resolution food mask (row-major runs, LEB128 varints): "
          f"{t['rle']['meanRleBytesPerImage']} bytes per mask on average. Aggregate compression ratio "
          f"{t['rle']['ratioVsBitmap']}x vs a packed 1-bit bitmap and {t['rle']['ratioVs8bit']}x vs an 8-bit mask "
          f"(median per image {t['rle']['medianRatioVsBitmap']}x vs bitmap). The API also returns the RLE of the "
          f"128x128 normalised mask (`features.maskRle`).",
          "",
          "## Tests", "",
          f"- Full backend suite: {res['tests'].get('fullSuite', {}).get('summary', 'not run')}",
          f"- Vision tests only: {res['tests'].get('visionTests', {}).get('summary', 'not run')}",
          "",
          "## Environment", ""]
    L += [f"- {k}: {v}" for k, v in res["versions"].items()]
    L += ["", "## Figures", "", "`figures/dataset_samples.png` shows 12 synthetic samples with ground truth."]
    for sname, paths in res["figures"].items():
        L.append(f"- {sname} (seed {FIG_SAMPLES[sname]}): " + ", ".join(f"`{Path(p).name}`" for p in paths.values()))
    if t["failures"]:
        L += ["", "## Held-out failures", "", "| seed | table | plate | touching | fill gt | fill est | count gt | count est |",
              "|---|---|---|---|---|---|---|---|"]
        L += [f"| {f['seed']} | {f['table']} | {f['plate']} | {f['touching']} | {f['fillGt']:.3f} | {f['fillEst']:.3f} | "
              f"{f['countGt']} | {f['countEst']} |" for f in t["failures"]]
    L += ["", "## Limitations", "",
          "- Synthetic data is cleaner than real photos (flat top-down view, round plates, food colours that differ from the plate).",
          "- White food (rice, curd) on a white plate has almost no colour distance and would be under-segmented.",
          "- Dish identity is not recognised from pixels: no labelled real dataset exists to train a classifier honestly. "
          "The endpoint ranks the outlet's own dishes by recent waste and prep volume, nudged by dominant colour.",
          "- Strongly overlapping portions (neck wider than ~84 % of the smaller portion's radius) merge into one segment.", ""]
    path.write_text("\n".join(L), encoding="utf-8")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--skip-tests", action="store_true")
    args = ap.parse_args(argv)
    out: Path = args.out
    figs = out / "figures"
    figs.mkdir(parents=True, exist_ok=True)

    print("figures ...")
    dataset_figure(figs)
    fig_paths = {name: stage_figures(synthetic.make_sample(seed), figs / name) for name, seed in FIG_SAMPLES.items()}
    print("evaluating development set ...")
    dev = evaluate(DEV_SEED, DEV_N)
    print("evaluating held-out set ...")
    test = evaluate(TEST_SEED, TEST_N)
    print("ablation (no illumination flattening) ...")
    ablation = evaluate(TEST_SEED, TEST_N, flatten_light=False)["overall"]
    print("endpoint latency ...")
    ep = endpoint_latency()
    tests = {} if args.skip_tests else (print("pytest ...") or run_tests())

    res = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": "opencv-pipeline-v1",
        "dataset": {"imageSize": f"{synthetic.W}x{synthetic.H}", "devImages": DEV_N, "testImages": TEST_N,
                    "totalImages": DEV_N + TEST_N},
        "dev": dev, "test": test, "ablationNoIlluminationFlattening": ablation, "endpoint": ep, "tests": tests,
        "versions": {"python": platform.python_version(), "opencv": cv2.__version__, "numpy": np.__version__,
                     "platform": platform.platform()},
        "figures": fig_paths,
    }
    (out / "results.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    write_markdown(res, out / "results.md")
    o = test["overall"]
    print(f"done: fill MAE {o['fillRatioMAE']}, count acc {o['portionCountAccuracy']}, "
          f"pipeline {test['pipelineMeanMs']} ms, endpoint {ep['meanMs']} ms -> {out}")


if __name__ == "__main__":
    main()
