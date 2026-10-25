"""Stage-by-stage and end-to-end tests for the classical CV pipeline (Module H).

Accuracy is measured on the reproducible synthetic set in
``app.vision.synthetic`` (no downloaded images). Thresholds were tuned on
seeds 2026-2085; the accuracy test here uses a held-out range (seed 5000+).
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.vision import analyse, compression, edges, enhance, features, frequency, segment, synthetic

HELD_OUT_SEED = 5000
HELD_OUT_N = 40


@pytest.fixture(scope="module")
def sample():
    return synthetic.make_sample(2027)  # two touching portions on a white plate


@pytest.fixture(scope="module")
def result(sample):
    return analyse(sample.image, keep_stages=True)


# --------------------------------------------------------------------------- synthetic data

def test_synthetic_is_reproducible_and_has_ground_truth():
    a, b = synthetic.make_sample(7), synthetic.make_sample(7)
    assert np.array_equal(a.image, b.image)
    assert a.image.shape == (synthetic.H, synthetic.W, 3) and a.image.dtype == np.uint8
    assert 0.0 <= a.fill_ratio < 1.0
    assert a.portion_count == len(a.portion_areas) == len(a.foods)
    ds = synthetic.make_dataset(12, seed=100)
    assert {s.meta["table"] for s in ds} == {"wood", "slate", "laminate"}
    assert {s.meta["plate"] for s in ds} == {"white", "offwhite", "grey"}


# --------------------------------------------------------------------------- Unit 1

def test_resize_normalises_long_side():
    img = np.zeros((300, 1000, 3), np.uint8)
    out, scale = enhance.resize_long_side(img, 512)
    assert max(out.shape[:2]) == 512 and scale == pytest.approx(0.512)


def test_median_filter_removes_salt_and_pepper():
    rng = np.random.default_rng(0)
    img = np.full((100, 100, 3), 128, np.uint8)
    noisy = img.copy()
    pts = rng.random((100, 100)) < 0.05
    noisy[pts] = 255
    den = enhance.denoise(noisy)
    assert np.abs(den.astype(int) - 128).mean() < 0.2 * np.abs(noisy.astype(int) - 128).mean()


def test_histogram_equalisation_and_clahe_spread_a_low_contrast_image():
    low = np.tile(np.linspace(100, 140, 256).astype(np.uint8), (64, 1))
    eq, stretched, cl = enhance.equalize_histogram(low), enhance.contrast_stretch(low), enhance.clahe(low, 2.0)
    assert eq.std() > 4 * low.std() and stretched.std() > 4 * low.std()
    # CLAHE also adds contrast, but its clip limit deliberately caps the gain
    assert low.std() < cl.std() < eq.std()
    assert enhance.histogram(low).sum() == low.size


def test_high_boost_increases_edge_contrast():
    step = np.zeros((32, 32), np.uint8)
    step[:, 16:] = 200
    blurred = cv2.GaussianBlur(step, (0, 0), 2)
    sharp = enhance.high_boost(blurred, 1.5)
    assert np.abs(np.diff(sharp.astype(int), axis=1)).max() > np.abs(np.diff(blurred.astype(int), axis=1)).max()


# --------------------------------------------------------------------------- Unit 2 / 5 edges

def test_edge_operators_respond_on_a_square():
    img = np.zeros((64, 64), np.uint8)
    img[16:48, 16:48] = 200
    _, _, mag = edges.sobel_gradients(img)
    assert mag[32, 16] > 100 and mag[32, 32] == 0
    can, _ = edges.auto_canny(img)
    assert can[16:48, 14:18].any() and not can[24:40, 24:40].any()
    log = edges.laplacian_of_gaussian(img, 2.0)
    assert edges.zero_crossings(log)[30:34, 13:20].any()
    dog = edges.difference_of_gaussians(img)
    assert np.abs(dog[32, 14:19]).max() > np.abs(dog[32, 30:34]).max()


# --------------------------------------------------------------------------- Unit 3 frequency

def test_dft_lowpass_removes_high_frequency_and_estimates_shading():
    yy, xx = np.mgrid[0:128, 0:128]
    shading = 150 + 60 * (xx / 127.0)
    texture = 20 * np.sin(xx * 1.3) * np.sin(yy * 1.1)
    img = (shading + texture).astype(np.float32)
    low = frequency.gaussian_lowpass(img, cutoff=4)
    assert np.abs(low - shading).mean() < 6
    flat = frequency.flatten_illumination(img.clip(0, 255).astype(np.uint8), low)
    assert flat[:, 10:30].mean() == pytest.approx(flat[:, 100:120].mean(), rel=0.08)
    spec = frequency.dft_magnitude(img)
    assert spec.shape == img.shape and spec.dtype == np.uint8
    smooth = frequency.high_frequency_energy_ratio(shading.astype(np.float32))
    busy = frequency.high_frequency_energy_ratio(texture.astype(np.float32))
    assert busy > smooth


# --------------------------------------------------------------------------- Units 2 / 3 / 5 segmentation

def test_plate_detection_hough_and_contour(sample, result):
    cx, cy, r = sample.plate
    s = result.measures["scale"]
    assert result.plate.method == "hough"
    assert abs(result.plate.r / s - r) / r < 0.03
    assert np.hypot(result.plate.cx / s - cx, result.plate.cy / s - cy) < 0.03 * r
    p = segment.detect_plate_contour(sample.image)
    assert p is not None and abs(p.r - r) / r < 0.06


def test_plate_falls_back_to_frame_without_a_plate():
    rng = np.random.default_rng(1)
    noise = rng.integers(0, 255, (240, 320, 3), dtype=np.uint8)
    assert analyse(noise).plate.method == "frame"


def test_otsu_and_morphology_produce_a_clean_mask(result, sample):
    raw, clean = result.stages["raw_mask"], result.stages["mask"]
    n_raw = segment.count_components(raw)
    n_clean = segment.count_components(clean)
    assert n_clean <= n_raw
    gt = cv2.resize(sample.mask, clean.shape[::-1], interpolation=cv2.INTER_NEAREST) > 0
    iou = np.logical_and(gt, clean > 0).sum() / np.logical_or(gt, clean > 0).sum()
    assert iou > 0.9


def test_empty_plate_has_no_food():
    s = next(x for x in synthetic.make_dataset(40, seed=2026) if x.portion_count == 0)
    r = analyse(s.image)
    assert r.fill_ratio < 0.01 and r.portion_count == 0


def test_watershed_splits_touching_portions(sample, result):
    assert sample.touching and sample.portion_count == 2
    assert result.measures["connectedComponents"] == 1   # they touch ...
    assert result.portion_count == 2                    # ... but watershed splits them
    assert result.stages["dist"].max() > 0


# --------------------------------------------------------------------------- Unit 4 features

def test_features_have_fixed_length_and_rotation_invariant_parts(sample, result):
    assert result.feature_vector.size == sum(result.feature_parts.values())
    other = analyse(synthetic.make_sample(2030).image)
    assert other.feature_vector.size == result.feature_vector.size
    mask = result.stages["roi_mask"]
    rot = features.rotate(mask, 37, nearest=True)
    assert np.allclose(features.hu_moments(mask)[:3], features.hu_moments(rot)[:3], atol=0.05)
    img = result.stages["roi_img"]
    h1 = features.colour_histogram(img, mask)
    h2 = features.colour_histogram(features.rotate(img, 90), features.rotate(mask, 90, nearest=True))
    assert np.abs(h1 - h2).sum() < 0.05
    desc, cells = features.hog(result.stages["roi_gray"])
    assert desc.size == 7 * 7 * 36 and cells.shape == (8, 8, 9)
    pyr = features.gaussian_pyramid(img, 3)
    assert [p.shape[0] for p in pyr] == [128, 64, 32]


def test_dominant_colour_names():
    green = np.full((40, 40, 3), (40, 140, 40), np.uint8)
    m = np.full((40, 40), 255, np.uint8)
    assert features.dominant_colour(green, m)["name"] == "green"
    white = np.full((40, 40, 3), (235, 238, 240), np.uint8)
    assert features.dominant_colour(white, m)["name"] == "white/cream"


# --------------------------------------------------------------------------- Unit 6 compression

def test_rle_round_trip_and_compression(result):
    mask = result.mask
    runs = compression.rle_encode(mask)
    assert sum(runs) == mask.size
    assert np.array_equal(compression.rle_decode(runs, mask.shape), (mask > 0).astype(np.uint8) * 255)
    enc = compression.compress_mask(mask)
    assert np.array_equal(compression.decompress_mask(enc), (mask > 0).astype(np.uint8) * 255)
    assert enc["ratioVsBitmap"] > 3
    starts_with_food = np.zeros((4, 4), np.uint8)
    starts_with_food[0, 0] = 255
    assert compression.rle_encode(starts_with_food)[0] == 0


# --------------------------------------------------------------------------- accuracy

def test_accuracy_on_held_out_synthetic_set():
    ds = synthetic.make_dataset(HELD_OUT_N, seed=HELD_OUT_SEED)
    errs, correct = [], 0
    for s in ds:
        r = analyse(s.image)
        errs.append(abs(r.fill_ratio - s.fill_ratio))
        correct += r.portion_count == s.portion_count
    assert float(np.mean(errs)) < 0.01        # fill-ratio MAE under one percentage point
    assert correct / len(ds) >= 0.9           # portion count exactly right on >= 90 %


def test_every_stage_is_timed(result):
    assert set(result.timings_ms) == {"resize", "denoise", "enhance", "plate", "illumination", "threshold",
                                      "morphology", "watershed", "edges", "features", "encode"}
    assert all(v >= 0 for v in result.timings_ms.values())


# --------------------------------------------------------------------------- endpoint contract

def test_endpoint_contract_on_a_synthetic_plate(sample):
    ok, buf = cv2.imencode(".jpg", sample.image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert ok
    client = TestClient(app)
    res = client.post("/api/vision/recognize", files={"image": ("plate.jpg", buf.tobytes(), "image/jpeg")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == {"items", "model", "note", "features"}
    assert body["model"] == "opencv-pipeline-v1"
    assert "classical computer vision" in body["note"].lower()
    for item in body["items"]:
        assert {"label", "dishName", "category", "estimatedQty", "confidence"} <= set(item)
        assert isinstance(item["estimatedQty"], int) and item["estimatedQty"] >= 1
        assert 0.3 <= item["confidence"] <= 0.6
    f = body["features"]
    assert f["portionCount"] == 2
    assert f["fillRatio"] == pytest.approx(sample.fill_ratio, abs=0.02)
    assert f["plate"]["method"] == "hough"
    assert f["featureVector"]["length"] > 1000
    assert np.array_equal(compression.decompress_mask(f["maskRle"]).shape, (128, 128))


def test_estimated_qty_grows_with_food():
    from app.api.vision import estimate_servings
    small = analyse(synthetic.make_sample(2035).image)   # one small portion
    big = analyse(synthetic.make_sample(2036).image)     # four portions
    assert estimate_servings(big) >= estimate_servings(small) >= 1


# --------------------------------------------------------------------------- robustness (real-user safety)

def _post(data: bytes, name: str = "p.jpg", ctype: str = "image/jpeg", **form):
    client = TestClient(app)
    return client.post("/api/vision/recognize", files={"image": (name, data, ctype)}, data=form or None)


def _encode(img: np.ndarray, ext: str = ".jpg") -> bytes:
    ok, buf = cv2.imencode(ext, img)
    assert ok
    return buf.tobytes()


def _assert_contract(body: dict) -> None:
    assert set(body) == {"items", "model", "note", "features"}
    assert body["items"]
    for item in body["items"]:
        assert {"label", "dishName", "category", "estimatedQty", "confidence"} <= set(item)
        assert item["estimatedQty"] >= 1 and 0.3 <= item["confidence"] <= 0.6


@pytest.mark.parametrize("case", ["no_plate", "all_black", "tiny", "large", "png_alpha"])
def test_endpoint_survives_odd_images(case):
    rng = np.random.default_rng(3)
    if case == "no_plate":           # cluttered texture, no round plate
        data = _encode(rng.integers(0, 255, (480, 640, 3), dtype=np.uint8))
    elif case == "all_black":
        data = _encode(np.zeros((480, 640, 3), np.uint8))
    elif case == "tiny":
        data = _encode(np.full((8, 8, 3), (40, 90, 200), np.uint8))
    elif case == "large":            # 4000x3000 phone-size photo of a synthetic plate
        data = _encode(cv2.resize(synthetic.make_sample(2027).image, (4000, 3000), interpolation=cv2.INTER_LINEAR))
        assert len(data) < 5 * 1024 * 1024
    else:                            # PNG with an alpha channel
        bgra = cv2.cvtColor(synthetic.make_sample(2030).image, cv2.COLOR_BGR2BGRA)
        bgra[:40, :40, 3] = 0
        data = _encode(bgra, ".png")
    res = _post(data, "p.png" if case == "png_alpha" else "p.jpg", "image/png" if case == "png_alpha" else "image/jpeg")
    assert res.status_code == 200, res.text
    body = res.json()
    _assert_contract(body)
    if case == "large":
        assert body["model"] == "opencv-pipeline-v1"
        assert body["features"]["portionCount"] == 2
        assert max(body["features"]["imageSize"]) == 512
    if case == "png_alpha":
        assert body["features"]["plate"]["method"] == "hough"


def test_pipeline_exception_falls_back_to_heuristic(monkeypatch):
    import app.api.vision as v

    def boom(data):
        raise RuntimeError("simulated pipeline failure")

    monkeypatch.setattr(v, "_run_pipeline", boom)
    res = _post(_encode(synthetic.make_sample(2027).image))
    assert res.status_code == 200, res.text
    body = res.json()
    _assert_contract(body)
    assert body["model"] == "heuristic-v0"
    assert {"hue", "saturation", "brightness", "contrast", "fill", "hue_share"} == set(body["features"])


def test_outlet_ranking_is_kept_and_cv_sets_quantity(monkeypatch):
    import app.api.vision as v

    dishes = [
        {"id": "a", "name": "Veg Biryani", "category": "Mains", "wasted": 2, "volume": 10, "prep_target": 0},
        {"id": "b", "name": "Dal Tadka", "category": "Mains", "wasted": 30, "volume": 40, "prep_target": 0},
        {"id": "c", "name": "Gulab Jamun", "category": "Desserts", "wasted": 10, "volume": 5, "prep_target": 0},
    ]
    monkeypatch.setattr(v, "_candidates", lambda outlet_id: dishes)
    res = _post(_encode(synthetic.make_sample(2036).image), outletId="o1")   # four portions
    body = res.json()
    _assert_contract(body)
    assert [i["dishName"] for i in body["items"]][0] == "Dal Tadka"   # most wasted dish still first
    assert body["items"][0]["estimatedQty"] == body["features"]["estimatedServings"] >= 1


def test_opencv_is_imported_lazily():
    import subprocess
    import sys
    code = "import sys, app.main; print('cv2' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=str(
        __import__("pathlib").Path(__file__).resolve().parents[1]))
    assert out.stdout.strip().endswith("False"), out.stdout + out.stderr
