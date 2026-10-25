"""Unit 6 - image compression: run-length encoding of the binary food mask.

A segmentation mask is mostly long runs of 0 and 255, which is exactly the
redundancy RLE removes. Runs are scanned row-major, start with a (possibly
empty) background run and alternate background / food. Each run length is
stored as an unsigned LEB128 varint, so short runs cost one byte.
"""

from __future__ import annotations

import base64

import numpy as np


def rle_encode(mask: np.ndarray) -> list[int]:
    """Alternating run lengths, first run = background (0)."""
    flat = (mask.ravel() > 0).astype(np.int8)
    if flat.size == 0:
        return []
    change = np.flatnonzero(np.diff(flat)) + 1
    bounds = np.concatenate(([0], change, [flat.size]))
    runs = np.diff(bounds).tolist()
    if flat[0] == 1:
        runs = [0] + runs
    return [int(r) for r in runs]


def rle_decode(runs: list[int], shape: tuple[int, int]) -> np.ndarray:
    """Inverse of :func:`rle_encode` (returns a 0/255 uint8 mask)."""
    vals = np.zeros(len(runs), np.uint8)
    vals[1::2] = 255
    return np.repeat(vals, runs).reshape(shape)


def varint_bytes(values: list[int]) -> bytes:
    """Unsigned LEB128: 7 data bits per byte, high bit = 'more bytes follow'."""
    out = bytearray()
    for v in values:
        while True:
            b = v & 0x7F
            v >>= 7
            if v:
                out.append(b | 0x80)
            else:
                out.append(b)
                break
    return bytes(out)


def varint_decode(data: bytes) -> list[int]:
    out, cur, shift = [], 0, 0
    for b in data:
        cur |= (b & 0x7F) << shift
        if b & 0x80:
            shift += 7
        else:
            out.append(cur)
            cur, shift = 0, 0
    return out


def compress_mask(mask: np.ndarray) -> dict:
    """Encode a mask and report sizes.

    ``ratio_vs_bitmap``: packed 1-bit-per-pixel size / RLE size (the honest
    baseline for a binary image); ``ratio_vs_8bit``: 8-bit-per-pixel size / RLE size."""
    runs = rle_encode(mask)
    payload = varint_bytes(runs)
    n = int(mask.size)
    bitmap = (n + 7) // 8
    size = max(1, len(payload))
    return {
        "shape": [int(mask.shape[0]), int(mask.shape[1])],
        "runs": len(runs),
        "rleBytes": len(payload),
        "bitmapBytes": bitmap,
        "rawBytes": n,
        "ratioVsBitmap": round(bitmap / size, 2),
        "ratioVs8bit": round(n / size, 2),
        "counts": base64.b64encode(payload).decode("ascii"),
    }


def decompress_mask(encoded: dict) -> np.ndarray:
    runs = varint_decode(base64.b64decode(encoded["counts"]))
    return rle_decode(runs, tuple(encoded["shape"]))
