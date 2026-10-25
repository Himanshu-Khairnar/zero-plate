"""The recognition endpoint accepts an image and answers with the agreed shape."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


def _jpeg(color=(200, 90, 40)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(buf, format="JPEG")
    return buf.getvalue()


def test_recognize_returns_suggestions_shape():
    client = TestClient(app)
    res = client.post("/api/vision/recognize", files={"image": ("tray.jpg", _jpeg(), "image/jpeg")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["model"] == "opencv-pipeline-v1"
    assert "not a trained" in body["note"].lower()
    assert isinstance(body["items"], list) and body["items"]
    item = body["items"][0]
    assert {"label", "estimatedQty", "confidence"} <= set(item)
    assert item["estimatedQty"] >= 1
    assert 0.3 <= item["confidence"] <= 0.6


def test_recognize_rejects_non_image():
    client = TestClient(app)
    res = client.post("/api/vision/recognize", files={"image": ("x.jpg", b"not an image", "image/jpeg")})
    assert res.status_code == 400
