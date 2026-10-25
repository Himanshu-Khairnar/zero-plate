"""Unit 1 - Language identification with character n-gram models.

Hinglish is code-mixed, so we identify language *per word* and then label
the sentence:

* Two character n-gram (n = 1..3, with word-boundary markers "<" and ">")
  multinomial Naive Bayes models, one for English words and one for romanised
  Hindi words. English training words come from the English training
  questions plus the stop-word list; Hindi words from the Hinglish lexicon
  and the Hinglish training questions (minus words that also occur in
  English questions, which are loanwords such as "waste" or "stock").
* Language-neutral tokens (numbers, menu / ingredient names, units) are
  skipped. Devanagari script is Hindi by definition.
* Sentence label: share of Hindi words h among the remaining words,
      h >= 0.8 -> "hi-Latn",   h <= 0.2 -> "en",   otherwise "mixed".

Example: "aaj kitna waste hua" -> aaj/kitna/hua Hindi, waste English,
h = 0.75 -> "mixed".
"""

from __future__ import annotations

import math
from collections import Counter

from app.nlp.lexicon import EN_STOP, HI_EN, HINGLISH_CANONICAL, HI_STOP


def char_ngrams(word: str, n_max: int = 3) -> list[str]:
    w = f"<{word}>"
    return [w[i:i + n] for n in range(1, n_max + 1) for i in range(len(w) - n + 1)]


class CharNgramLangID:
    def __init__(self, alpha: float = 0.5):
        self.alpha = alpha
        self.counts: dict[str, Counter] = {}
        self.totals: dict[str, int] = {}
        self.prior: dict[str, float] = {}
        self.V = 1

    def fit(self, words_by_lang: dict[str, list[str]]) -> "CharNgramLangID":
        feats = set()
        for lang, words in words_by_lang.items():
            c = Counter(g for w in words for g in char_ngrams(w))
            self.counts[lang], self.totals[lang] = c, sum(c.values())
            feats |= set(c)
        self.V = len(feats)
        n = sum(len(w) for w in words_by_lang.values())
        self.prior = {lang: math.log(len(w) / n) for lang, w in words_by_lang.items()}
        return self

    def word_scores(self, word: str) -> dict[str, float]:
        """log P(lang) + sum log P(gram | lang) (multinomial NB, add-alpha)."""
        out = {}
        for lang, c in self.counts.items():
            denom = self.totals[lang] + self.alpha * self.V
            out[lang] = self.prior[lang] + sum(math.log((c[g] + self.alpha) / denom) for g in char_ngrams(word))
        return out

    def word_lang(self, word: str) -> str:
        s = self.word_scores(word)
        return max(s, key=s.get)


def build_langid(train_examples, neutral: set[str]) -> CharNgramLangID:
    en_words, hi_words = set(EN_STOP), set(HI_EN) | set(HINGLISH_CANONICAL) | set(HI_STOP)
    en_from_data = set()
    for e in train_examples:
        if e.lang == "en":
            en_from_data.update(w for w in e.words if w.isalpha())
    en_words |= en_from_data
    for e in train_examples:
        if e.lang != "en":
            hi_words.update(w for w in e.words if w.isalpha() and w not in en_from_data)
    en_words -= neutral
    hi_words -= neutral | (en_words - set(HI_STOP))
    return CharNgramLangID().fit({"en": sorted(en_words), "hi": sorted(hi_words)})


def sentence_language(model: CharNgramLangID, words: list[str], neutral: set[str],
                      has_devanagari: bool = False) -> tuple[str, dict]:
    if has_devanagari:
        return "hi-Latn", {"hindiShare": 1.0, "words": {}}
    labels = {}
    for w in words:
        if not w.isalpha() or w in neutral:
            continue
        labels[w] = model.word_lang(w)
    if not labels:
        return "en", {"hindiShare": 0.0, "words": labels}
    h = sum(v == "hi" for v in labels.values()) / len(labels)
    lang = "hi-Latn" if h >= 0.8 else "en" if h <= 0.2 else "mixed"
    return lang, {"hindiShare": round(h, 3), "words": labels}
