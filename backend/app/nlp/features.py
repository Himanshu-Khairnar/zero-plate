"""Feature extraction for the intent classifiers.

For each question we emit:

* lemmas of non-slot words (Porter stem for English, Hindi lemma for
  Hinglish: "bikega" -> "bikna");
* the English gloss of every Hinglish lemma (bikna -> "sell"), stemmed the
  same way as English words, so Hinglish and English questions share
  evidence (cross-lingual mapping, Unit 5);
* slot placeholders instead of the slot words (__DISH__, __ING__, __DATE__,
  __QTY__) so "paneer" vs "chicken" does not matter for the intent;
* the WSD sense of ambiguous words ("order#purchase");
* the sentence tense (__tense_past__ / __tense_future__);
* lemma bigrams.
"""

from __future__ import annotations

from app.nlp.lexicon import HI_EN
from app.nlp.morphology import english_lemma, lemma


def lemmas(words: list[str], tags: list[str]) -> list[str]:
    out = []
    for w, t in zip(words, tags):
        if t != "O":
            if t.startswith("B-"):
                out.append(f"__{t[2:]}__")
            continue
        out.append(lemma(w)[0])
    return out


def intent_features(words: list[str], tags: list[str], senses: list[dict], tense: str | None) -> list[str]:
    lem = lemmas(words, tags)
    feats = list(lem)
    for l in lem:
        g = HI_EN.get(l)
        if g:
            feats.append(english_lemma(g) if "_" not in g else g)
    feats += [f"{s['word']}#{s['sense']}" for s in senses]
    if tense:
        feats.append(f"__tense_{tense}__")
    feats += [f"{a}_{b}" for a, b in zip(["<s>"] + lem, lem + ["</s>"])]
    return feats


def embedding_tokens(words: list[str]) -> list[str]:
    """Token form used by the PPMI corpus: Hindi verbs lemmatised, plurals stripped."""
    from app.nlp.morphology import hindi_analyse

    out = []
    for w in words:
        a = hindi_analyse(w)
        if a and a[0] in HI_EN:
            out.append(a[0])
        else:
            out.append(singular(w))
    return out


_KEEP_S = {"is", "was", "sales", "days", "does", "has", "chickpeas", "this", "yes", "less", "us", "plus", "gas",
           "his", "its", "pcs", "kgs", "bus"}


def singular(w: str) -> str:
    if w in _KEEP_S or len(w) <= 3 or not w.isalpha():
        return w
    if w.endswith("oes"):
        return w[:-2]
    if w.endswith("ies"):
        return w[:-3] + "y"
    if w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w
