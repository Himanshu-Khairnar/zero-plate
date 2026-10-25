"""Unit 2 - Word n-gram language models with smoothing, and perplexity.

`NgramLM(order)` counts n-grams over sentences padded with <s> ... </s>.
Words seen fewer than `min_count` times in training become <UNK>, so the
model assigns probability to unseen words in a principled way.

Three estimators:

* ``mle``      unsmoothed maximum likelihood  c(h,w) / c(h)
               (any unseen n-gram => P = 0 => infinite perplexity)
* ``laplace``  add-one                         (c(h,w) + 1) / (c(h) + V)
* ``gt``       Good-Turing discounting with Katz back-off:
               c* = (c+1) N_{c+1} / N_c  for c <= k (Katz's corrected form),
               P(w|h) = c*(h,w) / c(h)                       if c(h,w) > 0
                      = alpha(h) * P_katz(w | shorter h)       otherwise
               where alpha(h) hands the probability mass freed by the
               discount to the unseen words, in proportion to the
               lower-order model. The unigram base is add-one smoothed.

Perplexity  PP = exp( - (1/N) * sum log P(w_i | h_i) ) over all tokens of the
held-out sentences including </s>.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict

BOS, EOS, UNK = "<s>", "</s>", "<UNK>"


class NgramLM:
    def __init__(self, order: int = 2, min_count: int = 1, k: int = 5):
        self.n, self.min_count, self.k = order, min_count, k
        self.counts: list[Counter] = [Counter() for _ in range(order + 1)]  # counts[m][ngram tuple]
        self.ctx: list[Counter] = [Counter() for _ in range(order + 1)]     # counts of contexts
        self.vocab: set[str] = set()
        self._d: list[dict[int, float]] = []
        self._alpha: list[dict[tuple, float]] = []

    # ------------------------------------------------------------------ training
    def fit(self, sentences: list[list[str]]) -> "NgramLM":
        uni = Counter(w for s in sentences for w in s)
        self.vocab = {w for w, c in uni.items() if c >= self.min_count} | {EOS, UNK}
        for s in sentences:
            seq = [BOS] * (self.n - 1) + [self.map(w) for w in s] + [EOS]
            for m in range(1, self.n + 1):
                for i in range(self.n - 1, len(seq)):
                    g = tuple(seq[i - m + 1: i + 1])
                    if m == 1 and g[0] == BOS:
                        continue
                    self.counts[m][g] += 1
                    self.ctx[m][g[:-1]] += 1
        self._fit_gt()
        return self

    def map(self, w: str) -> str:
        return w if w in self.vocab else UNK

    @property
    def V(self) -> int:
        return len(self.vocab)

    def _fit_gt(self) -> None:
        """Katz discount ratios d_c per order, then back-off weights alpha(h)."""
        self._d = [{} for _ in range(self.n + 1)]
        for m in range(2, self.n + 1):
            nc = Counter(self.counts[m].values())
            k = self.k
            ratio_k = (k + 1) * nc.get(k + 1, 0) / nc[1] if nc.get(1) else 0.0
            for c in range(1, k + 1):
                if nc.get(c) and nc.get(c + 1):
                    cstar = (c + 1) * nc[c + 1] / nc[c]
                    d = (cstar / c - ratio_k) / (1 - ratio_k)
                else:
                    d = 0.0
                # Guard for sparse count-of-counts: fall back to absolute discounting by 0.5.
                self._d[m][c] = d if 0 < d < 1 else (c - 0.5) / c
        self._alpha = [{} for _ in range(self.n + 1)]
        by_ctx: dict[int, dict[tuple, list[str]]] = {m: defaultdict(list) for m in range(2, self.n + 1)}
        for m in range(2, self.n + 1):
            for g in self.counts[m]:
                by_ctx[m][g[:-1]].append(g[-1])
        for m in range(2, self.n + 1):
            for h, ws in by_ctx[m].items():
                seen = sum(self._gt_seen(h + (w,)) for w in ws)
                lower = sum(self.prob_gt(w, h[1:]) for w in ws)
                self._alpha[m][h] = max(1e-12, 1 - seen) / max(1e-12, 1 - lower)

    def _gt_seen(self, g: tuple) -> float:
        c = self.counts[len(g)][g]
        d = self._d[len(g)].get(c, 1.0)
        return d * c / self.ctx[len(g)][g[:-1]]

    # ------------------------------------------------------------------ probabilities
    def prob(self, w: str, h: tuple[str, ...], method: str = "gt") -> float:
        w = self.map(w)
        h = tuple(x if x == BOS else self.map(x) for x in h)[-(self.n - 1):] if self.n > 1 else ()
        if method == "mle":
            c = self.ctx[len(h) + 1][h]
            return self.counts[len(h) + 1][h + (w,)] / c if c else 0.0
        if method == "laplace":
            return (self.counts[len(h) + 1][h + (w,)] + 1) / (self.ctx[len(h) + 1][h] + self.V)
        if method == "gt":
            return self.prob_gt(w, h)
        raise ValueError(method)

    def prob_gt(self, w: str, h: tuple[str, ...]) -> float:
        if not h:
            return (self.counts[1][(w,)] + 1) / (self.ctx[1][()] + self.V)
        g = h + (w,)
        if self.counts[len(g)][g] > 0:
            return self._gt_seen(g)
        if self.ctx[len(g)][h] == 0:  # unseen context: back off fully
            return self.prob_gt(w, h[1:])
        return self._alpha[len(g)].get(h, 1.0) * self.prob_gt(w, h[1:])

    def sentence_logprob(self, s: list[str], method: str = "gt") -> float:
        seq = [BOS] * (self.n - 1) + list(s) + [EOS]
        lp = 0.0
        for i in range(self.n - 1, len(seq)):
            p = self.prob(seq[i], tuple(seq[max(0, i - self.n + 1): i]), method)
            if p <= 0:
                return -math.inf
            lp += math.log(p)
        return lp

    def perplexity(self, sentences: list[list[str]], method: str = "gt") -> dict:
        lp, n, zeros = 0.0, 0, 0
        for s in sentences:
            seq = [BOS] * (self.n - 1) + list(s) + [EOS]
            for i in range(self.n - 1, len(seq)):
                p = self.prob(seq[i], tuple(seq[max(0, i - self.n + 1): i]), method)
                n += 1
                if p <= 0:
                    zeros += 1
                else:
                    lp += math.log(p)
        pp = math.inf if zeros else math.exp(-lp / n)
        return {"perplexity": pp, "tokens": n, "zero_prob_tokens": zeros}
