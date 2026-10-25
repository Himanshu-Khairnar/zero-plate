"""Unit 2 - Spelling correction with the noisy-channel model.

For an out-of-vocabulary word x we pick

    w* = argmax_w  P(x | w) * P(w | prev) * P(next | w)

* candidates w: vocabulary words within a weighted Damerau-Levenshtein
  distance of x (dynamic programming, below);
* channel model P(x|w) = exp(-lambda * cost(x, w)) where the edit costs encode
  typical typing / romanisation errors: vowel-for-vowel substitutions
  ("wastege"), doubled letters ("panner"), dropped vowels ("forcast") and
  phonetically close consonants (k/c, v/w, z/j) are cheaper than arbitrary
  edits;
* prior P(w | context) from the Katz/Good-Turing bigram language model
  (app.nlp.lm) trained on the training questions plus the menu names.

Only non-word errors are corrected (a word already in the vocabulary is left
alone). The word itself is always a candidate, scored with the LM's <UNK>
probability and a fixed "keep" channel probability, so brand names and other
genuinely new words survive.
"""

from __future__ import annotations

import math

from app.nlp.lm import NgramLM

VOWELS = set("aeiou")
CLOSE = {frozenset(p) for p in ("ck", "kq", "sz", "vw", "jz", "dt", "iy", "ph", "nm", "gj")}


def sub_cost(a: str, b: str) -> float:
    if a == b:
        return 0.0
    if a in VOWELS and b in VOWELS:
        return 0.5
    if frozenset((a, b)) in CLOSE:
        return 0.6
    return 1.0


def indel_cost(s: str, i: int) -> float:
    """Cost of inserting/deleting s[i]: cheap for doubled letters and vowels."""
    ch = s[i]
    if (i > 0 and s[i - 1] == ch) or (i + 1 < len(s) and s[i + 1] == ch):
        return 0.5
    if ch in VOWELS or ch in "hy":
        return 0.7
    return 1.0


def edit_distance(x: str, w: str) -> float:
    """Weighted Damerau-Levenshtein (optimal string alignment) distance."""
    n, m = len(x), len(w)
    D = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        D[i][0] = D[i - 1][0] + indel_cost(x, i - 1)
    for j in range(1, m + 1):
        D[0][j] = D[0][j - 1] + indel_cost(w, j - 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            best = min(
                D[i - 1][j] + indel_cost(x, i - 1),          # deletion from x
                D[i][j - 1] + indel_cost(w, j - 1),          # insertion into x
                D[i - 1][j - 1] + sub_cost(x[i - 1], w[j - 1]),
            )
            if i > 1 and j > 1 and x[i - 1] == w[j - 2] and x[i - 2] == w[j - 1]:
                best = min(best, D[i - 2][j - 2] + 0.8)      # transposition
            D[i][j] = best
    return D[n][m]


def plain_levenshtein(a: str, b: str) -> int:
    """Unweighted Levenshtein distance (used by tests / as a reference)."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


class SpellCorrector:
    def __init__(self, vocab: set[str], lm: NgramLM, lam: float = 3.0, keep_prob: float = 0.2,
                 max_cost: float = 2.0):
        self.vocab = {w for w in vocab if w.isalpha()}
        self.lm, self.lam, self.keep_logp, self.max_cost = lm, lam, math.log(keep_prob), max_cost
        self._by_len: dict[int, list[str]] = {}
        for w in self.vocab:
            self._by_len.setdefault(len(w), []).append(w)

    def candidates(self, x: str) -> list[tuple[str, float]]:
        limit = self.max_cost if len(x) > 4 else 1.0
        out = []
        for L in range(len(x) - 2, len(x) + 3):
            for w in self._by_len.get(L, ()):
                c = edit_distance(x, w)
                if c <= limit:
                    out.append((w, c))
        return out

    def _ctx_logp(self, w: str, prev: str, nxt: str | None) -> float:
        lp = math.log(self.lm.prob(w, (prev,)))
        if nxt is not None:
            lp += math.log(self.lm.prob(nxt, (w,)))
        return lp

    def correct_word(self, x: str, prev: str = "<s>", nxt: str | None = None) -> tuple[str, list[dict]]:
        """Best correction for x (x itself if nothing beats keeping it) + scored candidates."""
        if x in self.vocab or len(x) < 3 or not x.isalpha():
            return x, []
        scored = [{"word": x, "cost": 0.0, "score": self.keep_logp + self._ctx_logp(x, prev, nxt)}]
        for w, c in self.candidates(x):
            scored.append({"word": w, "cost": round(c, 2),
                           "score": -self.lam * c + self._ctx_logp(w, prev, nxt)})
        scored.sort(key=lambda d: -d["score"])
        return scored[0]["word"], scored[:5]

    def correct(self, words: list[str], skip: set[int] | None = None) -> tuple[list[str], list[dict]]:
        """Correct a sentence left to right. Returns (new words, [{from, to, index}])."""
        out, fixes = list(words), []
        for i, x in enumerate(words):
            if skip and i in skip:
                continue
            prev = out[i - 1] if i > 0 else "<s>"
            nxt = words[i + 1] if i + 1 < len(words) and words[i + 1] in self.vocab else None
            best, cands = self.correct_word(x, prev, nxt)
            if best != x:
                out[i] = best
                fixes.append({"index": i, "from": x, "to": best, "candidates": cands[:3]})
        return out, fixes
