"""Menu / ingredient gazetteer: phrase matching and fuzzy canonical lookup.

* `phrases` - lemmatised name phrases (plus head-word and Hinglish aliases)
  used by the rule-based tagger (longest match).
* `word_class(w)` - the open-class symbol the HMM falls back to for words it
  never saw in training ("<D>" = part of a dish name, "<I>" = ingredient,
  "<NUM>", "<DATE>", ...). This lets the tagger recognise an outlet's own
  dishes ("hakka noodles") without retraining.
* `resolve(words, kind)` - fuzzy lookup of a mention against the outlet's
  names: the mention is first mapped to English through the bilingual
  dictionary (pyaaz -> onion), then scored by character-trigram Dice
  similarity and word overlap, with word-vector similarity (PPMI-SVD,
  app.nlp.embeddings) as a synonym back-off ("chai" ~ "tea").
"""

from __future__ import annotations

from typing import Callable

from app.nlp.fsa import token_class
from app.nlp.lexicon import DEFAULT_DISHES, DEFAULT_INGREDIENTS, HI_EN
from app.nlp.morphology import english_lemma

EN_HI: dict[str, list[str]] = {}
for _hi, _en in HI_EN.items():
    EN_HI.setdefault(_en, []).append(_hi)

# Generic head words that should also find a multi-word name.
_HEAD_ALIASES = {"rice", "flour", "oil", "cream", "dal", "lentils", "biryani", "dosa", "thali", "coffee", "chai",
                 "pulao", "khichdi", "curry", "tikka", "batter", "powder", "leaves", "tea"}
_EXTRA_ALIASES = {"toor dal": "Lentils (toor)", "tea": "Tea leaves", "chai patti": "Tea leaves",
                  "veg stock": "Vegetables", "dal": "Lentils (toor)",
                  "lentils": "Lentils (toor)", "eggs": "Eggs", "egg": "Eggs"}


def types_of_word_is_common(w: str) -> bool:
    """English 'do'/'one'/'a' are number words too; never treat them as numbers alone."""
    return w in {"do", "one", "a", "ek", "char", "das", "sau"}


def _key(word: str) -> str:
    return english_lemma(word)


def trigrams(s: str) -> set[str]:
    s = f"  {s.lower()} "
    return {s[i:i + 3] for i in range(len(s) - 2)}


def dice(a: str, b: str) -> float:
    ta, tb = trigrams(a), trigrams(b)
    return 2 * len(ta & tb) / (len(ta) + len(tb)) if ta and tb else 0.0


def _clean_name(name: str) -> list[str]:
    return [w for w in name.lower().replace("(", " ").replace(")", " ").split() if w]


class Gazetteer:
    def __init__(self, dishes: list[str] | None = None, ingredients: list[str] | None = None):
        self.dishes = list(dict.fromkeys(dishes or DEFAULT_DISHES))
        self.ingredients = list(dict.fromkeys(ingredients or DEFAULT_INGREDIENTS))
        self.phrases: dict[tuple[str, ...], tuple[str, str]] = {}   # lemma tuple -> (TYPE, canonical)
        self.word_types: dict[str, set[str]] = {}
        for kind, names in (("DISH", self.dishes), ("ING", self.ingredients)):
            for name in names:
                words = _clean_name(name)
                self._add(words, kind, name)
                if len(words) > 1 and words[-1] in _HEAD_ALIASES:
                    for alias in [words[-1]] + EN_HI.get(words[-1], []):
                        self._add([alias], kind, name, weak=True)
                        self._add(words[:-1] + [alias], kind, name)  # "basmati chawal"
                for w in words:  # Hinglish synonyms of each English word
                    for hi in EN_HI.get(english_lemma(w), []) + EN_HI.get(w, []):
                        self.word_types.setdefault(_key(hi), set()).add(kind)
                        if len(words) == 1:
                            self._add([hi], kind, name)
        for alias, canon in _EXTRA_ALIASES.items():
            if canon in self.ingredients:
                self._add(alias.split(), "ING", canon)
        self.max_len = max((len(p) for p in self.phrases), default=1)

    def _add(self, words: list[str], kind: str, canonical: str, weak: bool = False) -> None:
        key = tuple(_key(w) for w in words)
        if weak and key in self.phrases:
            return
        self.phrases.setdefault(key, (kind, canonical))
        for k in key:
            self.word_types.setdefault(k, set()).add(kind)

    # ------------------------------------------------------------------ symbols
    def word_class(self, w: str) -> str:
        c = token_class(w)
        if c in ("NUM", "HINUM") and not types_of_word_is_common(w):
            return "<NUM>"
        if c in ("REL", "WDAY", "WKND", "PER", "DAYS"):
            return "<DATE>"
        if c == "UNIT":
            return "<UNIT>"
        types = self.word_types.get(_key(w), set())
        if types == {"DISH"}:
            return "<D>"
        if types == {"ING"}:
            return "<I>"
        if types:
            return "<DI>"
        return "<UNK>"

    # ------------------------------------------------------------------ matching
    def longest_matches(self, words: list[str]) -> list[tuple[int, int, str]]:
        keys = [_key(w) for w in words]
        out, i = [], 0
        while i < len(words):
            for L in range(min(self.max_len, len(words) - i), 0, -1):
                hit = self.phrases.get(tuple(keys[i:i + L]))
                if hit:
                    out.append((i, i + L, hit[0]))
                    i += L
                    break
            else:
                i += 1
        return out

    def resolve(self, words: list[str], kind: str,
                similar: Callable[[str, str], float] | None = None) -> tuple[str | None, float]:
        """Best canonical name for a mention, with a 0..1 score (None if < 0.45)."""
        names = self.dishes if kind == "DISH" else self.ingredients
        exact = self.phrases.get(tuple(_key(w) for w in words))
        if exact and exact[0] == kind:
            return exact[1], 1.0
        english = [HI_EN.get(w, w) for w in words]
        mention = " ".join(english)
        best, best_s = None, 0.0
        for name in names:
            nwords = _clean_name(name)
            s_char = max(dice(mention, " ".join(nwords)), max(dice(mention, w) for w in nwords))
            overlap = 0.0
            for q in english:
                for nw in nwords:
                    if _key(q) == _key(nw):
                        overlap = max(overlap, 1.0)
                    elif similar:
                        sim = similar(q, nw)  # distributional synonym ("tea" ~ "chai")
                        if sim >= 0.6:
                            overlap = max(overlap, sim)
            s = 0.5 * s_char + 0.5 * overlap
            if s > best_s:
                best, best_s = name, s
        return (best, round(best_s, 3)) if best_s >= 0.45 else (None, round(best_s, 3))
