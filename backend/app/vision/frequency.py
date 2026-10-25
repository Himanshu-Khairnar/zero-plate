"""Unit 3 - processing in the frequency domain.

Uneven kitchen lighting is a slowly varying multiplicative field, i.e. it lives
in the lowest spatial frequencies. A Gaussian low-pass filter applied in the
2-D DFT domain estimates that field; dividing it out flattens the plate so the
colour-distance food cue works the same in a bright and a dark corner.
"""

from __future__ import annotations

import cv2
import numpy as np


def dft_magnitude(gray: np.ndarray) -> np.ndarray:
    """Centred log-magnitude spectrum log(1 + |F(u, v)|), scaled to uint8."""
    F = np.fft.fftshift(np.fft.fft2(gray.astype(np.float32)))
    mag = np.log1p(np.abs(F))
    mag = (mag - mag.min()) / max(float(mag.max() - mag.min()), 1e-9)
    return (mag * 255).astype(np.uint8)


def gaussian_transfer(shape: tuple[int, int], cutoff: float) -> np.ndarray:
    """Gaussian low-pass transfer function H(u,v) = exp(-D^2 / (2 D0^2)),
    centred, with D measured in frequency samples and D0 = ``cutoff``."""
    h, w = shape
    u = np.arange(h) - h // 2
    v = np.arange(w) - w // 2
    D2 = u[:, None] ** 2 + v[None, :] ** 2
    return np.exp(-D2 / (2.0 * cutoff ** 2)).astype(np.float32)


def gaussian_lowpass(img: np.ndarray, cutoff: float) -> np.ndarray:
    """Filter a single-channel image with a Gaussian low-pass in the DFT
    domain: G = IDFT( H . DFT(f) ). Edge-replicating padding reduces the
    wrap-around artefacts of the periodic DFT. Returns float32."""
    f = img.astype(np.float32)
    h, w = f.shape
    py, px = h // 4, w // 4
    padded = np.pad(f, ((py, py), (px, px)), mode="reflect")
    F = np.fft.fftshift(np.fft.fft2(padded))
    H = gaussian_transfer(padded.shape, cutoff * padded.shape[0] / h)
    g = np.real(np.fft.ifft2(np.fft.ifftshift(F * H)))
    return g[py:py + h, px:px + w].astype(np.float32)


def estimate_illumination(L: np.ndarray, mask: np.ndarray | None = None, cutoff: float = 3.0,
                          downsample: int = 2) -> np.ndarray:
    """Illumination (shading) field of a lightness channel.

    Only pixels inside ``mask`` (bare plate) are trusted. The field is a
    *normalised convolution* done in the frequency domain:
    field = LP(L . m) / LP(m), with LP the Gaussian low-pass, so masked-out
    pixels (food, table) neither pull the estimate down nor leave holes.
    Because the field only holds a few cycles per image, the DFTs run on a
    ``downsample``-level Gaussian-pyramid copy (16x fewer pixels for 2 levels)
    and the result is interpolated back up; the cutoff is in cycles per image,
    so it is unchanged by the down-sampling."""
    src = L.astype(np.float32)
    m = np.ones_like(src) if mask is None or not np.count_nonzero(mask) else (mask > 0).astype(np.float32)
    num, den = src * m, m
    for _ in range(downsample):
        num, den = cv2.pyrDown(num), cv2.pyrDown(den)
    num, den = gaussian_lowpass(num, cutoff), gaussian_lowpass(den, cutoff)
    fallback = float(np.median(src[m > 0]))
    field = np.where(den > 0.05, num / np.maximum(den, 1e-6), fallback).astype(np.float32)
    field = cv2.resize(field, (L.shape[1], L.shape[0]), interpolation=cv2.INTER_CUBIC)
    return np.maximum(field, 1.0)


def flatten_illumination(L: np.ndarray, illumination: np.ndarray, target: float | None = None) -> np.ndarray:
    """Homomorphic-style correction: L' = L / illumination * target."""
    t = float(np.median(illumination)) if target is None else target
    return np.clip(L.astype(np.float32) / illumination * t, 0, 255).astype(np.uint8)


def high_frequency_energy_ratio(gray: np.ndarray, cutoff_frac: float = 0.15) -> float:
    """Texture energy: share of spectral energy (excluding DC) outside a
    radius of ``cutoff_frac`` x the half-size. Busy textures score higher."""
    if gray.size == 0:
        return 0.0
    F = np.fft.fftshift(np.fft.fft2(gray.astype(np.float32) - float(gray.mean())))
    P = np.abs(F) ** 2
    h, w = gray.shape
    u = np.arange(h) - h // 2
    v = np.arange(w) - w // 2
    D = np.sqrt(u[:, None] ** 2 + v[None, :] ** 2)
    total = float(P.sum())
    if total <= 0:
        return 0.0
    return float(P[D > cutoff_frac * min(h, w) / 2].sum() / total)
