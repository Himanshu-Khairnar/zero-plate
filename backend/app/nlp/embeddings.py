"""Unit 5 - Distributional word vectors: PPMI + truncated SVD.

1. Co-occurrence counts C[w, c] within a symmetric window (+-2 words) over
   the training questions.
2. Positive pointwise mutual information with context-distribution smoothing
   (Levy, Goldberg & Dagan 2015):
       PPMI(w, c) = max(0, log  P(w, c) / (P(w) * P_alpha(c))),  alpha = 0.75
3. Truncated SVD  M ~ U_k S_k V_k^T ; word vectors W = U_k * sqrt(S_k).

Cross-lingual mapping (Hinglish <-> English). English and Hinglish questions
rarely share contexts, so the raw spaces would not align. We use
*code-switching augmentation* with a seed bilingual dictionary: every
training sentence is copied with dictionary words swapped into the other
language ("kitna paneer chahiye" -> "how_much paneer need"). Translation
pairs then share contexts and land close together. Only half of the
dictionary (the seed half) is used for augmentation; the other half is held
out to measure whether the mapping generalises (precision@k in the report).

Used for: synonym matching in the fuzzy dish / ingredient lookup ("tea" ~
"chai" -> "Masala Chai"), translating unknown Hinglish words, and an
embedding-centroid intent classifier.
"""

from __future__ import annotations

import random
from collections import Counter

import numpy as np

from app.nlp.lexicon import HI_EN


def seed_split(seed: int = 7) -> tuple[dict[str, str], dict[str, str]]:
    """Split the bilingual dictionary into (seed, held-out) halves, deterministically."""
    items = sorted(HI_EN.items())
    rng = random.Random(seed)
    rng.shuffle(items)
    half = len(items) // 2
    return dict(items[:half]), dict(items[half:])


def code_switch(sentences: list[list[str]], dictionary: dict[str, str], seed: int = 7) -> list[list[str]]:
    rng = random.Random(seed)
    en_hi: dict[str, str] = {}
    for h, e in dictionary.items():
        en_hi.setdefault(e, h)
    out = []
    for s in sentences:
        out.append(s)
        for _ in range(2):
            new = []
            for w in s:
                if w in dictionary and rng.random() < 0.7:
                    new.append(dictionary[w])
                elif w in en_hi and rng.random() < 0.7:
                    new.append(en_hi[w])
                else:
                    new.append(w)
            if new != s:
                out.append(new)
    return out


class PPMIEmbeddings:
    def __init__(self, dim: int = 48, window: int = 2, alpha: float = 0.75, min_count: int = 1):
        self.dim, self.window, self.alpha, self.min_count = dim, window, alpha, min_count
        self.vocab: dict[str, int] = {}
        self.W = np.zeros((0, dim), dtype=np.float32)

    def fit(self, sentences: list[list[str]]) -> "PPMIEmbeddings":
        freq = Counter(w for s in sentences for w in s)
        words = sorted(w for w, c in freq.items() if c >= self.min_count)
        self.vocab = {w: i for i, w in enumerate(words)}
        V = len(words)
        C = np.zeros((V, V), dtype=np.float64)
        for s in sentences:
            idx = [self.vocab.get(w) for w in s]
            for i, wi in enumerate(idx):
                if wi is None:
                    continue
                for j in range(max(0, i - self.window), min(len(idx), i + self.window + 1)):
                    if j != i and idx[j] is not None:
                        C[wi, idx[j]] += 1.0
        total = C.sum()
        pw = C.sum(1) / total
        cc = C.sum(0) ** self.alpha
        pc = cc / cc.sum()
        with np.errstate(divide="ignore", invalid="ignore"):
            pmi = np.log((C / total) / np.outer(pw, pc))
        self.ppmi = np.where(np.isfinite(pmi) & (pmi > 0), pmi, 0.0)
        U, S, _ = np.linalg.svd(self.ppmi, full_matrices=False)
        k = min(self.dim, len(S))
        W = U[:, :k] * np.sqrt(S[:k])
        norms = np.linalg.norm(W, axis=1, keepdims=True)
        self.W = (W / np.where(norms == 0, 1, norms)).astype(np.float32)
        self.singular_values = S[:k]
        return self

    def __contains__(self, w: str) -> bool:
        return w in self.vocab

    def vec(self, w: str) -> np.ndarray | None:
        i = self.vocab.get(w)
        return None if i is None else self.W[i]

    def similarity(self, a: str, b: str) -> float:
        va, vb = self.vec(a), self.vec(b)
        if va is None or vb is None:
            return 0.0
        return float(np.dot(va, vb))

    def neighbours(self, w: str, k: int = 5, restrict: set[str] | None = None) -> list[tuple[str, float]]:
        v = self.vec(w)
        if v is None:
            return []
        sims = self.W @ v
        order = np.argsort(-sims)
        inv = {i: x for x, i in self.vocab.items()}
        out = []
        for i in order:
            x = inv[int(i)]
            if x == w or (restrict is not None and x not in restrict):
                continue
            out.append((x, round(float(sims[i]), 3)))
            if len(out) >= k:
                break
        return out
