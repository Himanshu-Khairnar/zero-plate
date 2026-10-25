"""Unit 4 - Word-sense disambiguation with the simplified Lesk algorithm.

Ambiguous kitchen words and their senses are defined in a small hand-written
gloss dictionary (data/wsd.json):

    plate  dish | portion | crockery        order  purchase | customer | sequence
    stock  inventory | broth                kal    yesterday | tomorrow
    left   remaining | uneaten | direction

Simplified Lesk (Kilgarriff & Rosenzweig 2000): choose the sense whose
signature (gloss words) has the largest overlap with the context words of
the sentence. Both sides are stemmed (Porter / Hindi lemma) and stop words
are removed so "sold" matches "sell" and "biki" matches "bika". Ties (and
zero overlap) fall back to the most frequent sense. Overlapping words are
returned as the explanation.

The chosen sense feeds the intent classifier as an extra feature
("order#purchase" vs "order#customer"), which separates "how much paneer
should I order" (purchase) from "how many orders did we get" (sales).
"""

from __future__ import annotations

from functools import lru_cache

from app.nlp.corpus import load_json
from app.nlp.lexicon import EN_STOP, HI_STOP
from app.nlp.morphology import lemma

_ALIASES = {"plates": "plate", "orders": "order", "ordered": "order", "ordering": "order", "stocks": "stock",
            "portion": "plate"}


def _norm_target(w: str) -> str:
    return _ALIASES.get(w, w)


def _bag(words: list[str]) -> set[str]:
    out = set()
    for w in words:
        if w in EN_STOP or w in HI_STOP or not w.isalpha():
            continue
        out.add(lemma(w)[0])
    return out


@lru_cache(maxsize=1)
def _resources() -> tuple[dict[str, dict[str, set[str]]], dict[str, str]]:
    data = load_json("wsd.json")
    sig = {word: {sense: _bag(gloss.replace("-", " ").split()) for sense, gloss in senses.items()}
           for word, senses in data["glosses"].items()}
    return sig, data["first_sense"]


def ambiguous_words() -> list[str]:
    return list(_resources()[0])


def lesk(words: list[str], index: int) -> dict | None:
    """Disambiguate words[index]; None when it is not an ambiguous target."""
    sig, first = _resources()
    target = _norm_target(words[index])
    if target not in sig:
        return None
    context = _bag([w for i, w in enumerate(words) if i != index])
    scores = {s: sorted(context & g) for s, g in sig[target].items()}
    best = max(scores, key=lambda s: (len(scores[s]), s == first[target]))
    if not scores[best]:
        best = first[target]
    return {"word": target, "index": index, "sense": best, "overlap": scores[best],
            "scores": {s: len(v) for s, v in scores.items()}}


def disambiguate(words: list[str]) -> list[dict]:
    return [r for i in range(len(words)) if (r := lesk(words, i))]
