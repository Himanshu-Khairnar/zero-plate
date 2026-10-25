"""Unit 2 - Morphology: inflectional and derivational analysis.

English: the Porter (1980) suffix-stripping stemmer, written out step by
step (1a plurals, 1b -ed/-ing, 1c y->i, 2/3 derivational suffixes such as
-ational/-ization/-ful/-ness, 4 -ance/-ment/..., 5 final -e / double l),
plus one domain rule for the derivational suffix -age (wastage -> wast).

Hinglish: romanised Hindi verbs inflect for tense, gender and number by
suffix (bik-a / bik-i / bik-e "was sold", bik-ega / bik-egi / bik-enge
"will sell", bik-ta "sells", bik-na infinitive). `hindi_analyse` strips
these suffixes against a lexicon of known verb stems and returns the lemma
(infinitive) plus morphological features. A lemma table covers irregular
forms (hua/tha/hoga of "hona", chahiye) and oblique nouns (hafte -> hafta).

`sentence_tense` combines both analyses to label an utterance as past or
future, which the date recogniser uses to read ambiguous "kal" (Hindi uses
one word for both yesterday and tomorrow) and "parso".
"""

from __future__ import annotations

import re

# =========================================================================== Porter
_VOWELS = set("aeiou")


def _cons(w: str, i: int) -> bool:
    ch = w[i]
    if ch in _VOWELS:
        return False
    if ch == "y":
        return i == 0 or not _cons(w, i - 1)
    return True


def _measure(stem: str) -> int:
    """m in [C](VC)^m[V]."""
    m, i, n = 0, 0, len(stem)
    while i < n and _cons(stem, i):
        i += 1
    while i < n:
        while i < n and not _cons(stem, i):
            i += 1
        if i >= n:
            break
        while i < n and _cons(stem, i):
            i += 1
        m += 1
    return m


def _has_vowel(stem: str) -> bool:
    return any(not _cons(stem, i) for i in range(len(stem)))


def _double_cons(w: str) -> bool:
    return len(w) >= 2 and w[-1] == w[-2] and _cons(w, len(w) - 1)


def _cvc(w: str) -> bool:
    if len(w) < 3:
        return False
    return _cons(w, len(w) - 3) and not _cons(w, len(w) - 2) and _cons(w, len(w) - 1) and w[-1] not in "wxy"


def _replace(w: str, suffix: str, rep: str, min_m: int) -> str | None:
    if w.endswith(suffix):
        stem = w[: len(w) - len(suffix)]
        return stem + rep if _measure(stem) > min_m else w
    return None


_STEP2 = [("ational", "ate"), ("tional", "tion"), ("enci", "ence"), ("anci", "ance"), ("izer", "ize"),
          ("abli", "able"), ("alli", "al"), ("entli", "ent"), ("eli", "e"), ("ousli", "ous"),
          ("ization", "ize"), ("ation", "ate"), ("ator", "ate"), ("alism", "al"), ("iveness", "ive"),
          ("fulness", "ful"), ("ousness", "ous"), ("aliti", "al"), ("iviti", "ive"), ("biliti", "ble")]
_STEP3 = [("icate", "ic"), ("ative", ""), ("alize", "al"), ("iciti", "ic"), ("ical", "ic"), ("ful", ""),
          ("ness", "")]
_STEP4 = ["al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement", "ment", "ent", "ion", "ou",
          "ism", "ate", "iti", "ous", "ive", "ize"]


def porter_stem(word: str) -> str:
    w = word.lower()
    if len(w) <= 2:
        return w
    # Step 1a
    if w.endswith("sses"):
        w = w[:-2]
    elif w.endswith("ies"):
        w = w[:-2]
    elif w.endswith("ss"):
        pass
    elif w.endswith("s"):
        w = w[:-1]
    # Step 1b
    flag = False
    if w.endswith("eed"):
        if _measure(w[:-3]) > 0:
            w = w[:-1]
    else:
        for suf in ("ed", "ing"):
            if w.endswith(suf) and _has_vowel(w[: -len(suf)]):
                w, flag = w[: -len(suf)], True
                break
    if flag:
        if w.endswith(("at", "bl", "iz")):
            w += "e"
        elif _double_cons(w) and w[-1] not in "lsz":
            w = w[:-1]
        elif _measure(w) == 1 and _cvc(w):
            w += "e"
    # Step 1c
    if w.endswith("y") and _has_vowel(w[:-1]):
        w = w[:-1] + "i"
    # Steps 2 and 3
    for table in (_STEP2, _STEP3):
        for suf, rep in table:
            r = _replace(w, suf, rep, 0)
            if r is not None:
                w = r
                break
    # Step 4
    for suf in _STEP4:
        if w.endswith(suf):
            stem = w[: -len(suf)]
            if _measure(stem) > 1 and (suf != "ion" or stem.endswith(("s", "t"))):
                w = stem
            break
    # Step 5a / 5b
    if w.endswith("e"):
        stem = w[:-1]
        if _measure(stem) > 1 or (_measure(stem) == 1 and not _cvc(stem)):
            w = stem
    if _measure(w) > 1 and _double_cons(w) and w.endswith("l"):
        w = w[:-1]
    return w


# Domain derivational rule on top of Porter: -age nouns (wastage, spillage,
# breakage) derive from the verb.
_DERIV = re.compile(r"^(?P<base>[a-z]{3,})age$")
_EN_IRREGULAR = {
    "sold": "sell", "bought": "buy", "went": "go", "made": "make", "threw": "throw", "thrown": "throw",
    "spoilt": "spoil", "ate": "eat", "eaten": "eat", "was": "be", "were": "be", "is": "be", "are": "be",
    "am": "be", "did": "do", "does": "do", "done": "do", "had": "have", "has": "have", "left": "left",
    "people": "person", "children": "child", "potatoes": "potato", "tomatoes": "tomato",
}


def english_lemma(word: str) -> str:
    w = word.lower()
    if w in _EN_IRREGULAR:
        return porter_stem(_EN_IRREGULAR[w])
    m = _DERIV.match(w)
    if m and w not in {"garbage", "cabbage", "village", "page", "message", "average", "storage"}:
        return porter_stem(m.group("base"))
    return porter_stem(w)


# =========================================================================== Hindi
# Known verb stems -> infinitive lemma. Suffixes are stripped against these.
HI_VERB_STEMS: dict[str, str] = {
    "bik": "bikna", "bech": "bechna", "bach": "bachna", "phenk": "phenkna", "mangwa": "mangwana",
    "manga": "mangwana", "kharid": "kharidna", "le": "lena", "de": "dena", "bana": "banana",
    "pak": "pakana", "paka": "pakana", "aa": "aana", "aay": "aana", "ja": "jana", "jay": "jana",
    "dikha": "dikhana", "bata": "batana", "kar": "karna", "ho": "hona", "sad": "sadna",
    "pad": "padna", "lag": "lagna", "suna": "sunana", "rakh": "rakhna", "bhej": "bhejna",
}
# Ordered longest-first: (suffix, features)
HI_VERB_SUFFIXES: list[tuple[str, dict]] = [
    ("enge", {"tense": "future", "num": "pl"}), ("engi", {"tense": "future", "num": "pl", "gender": "f"}),
    ("egi", {"tense": "future", "gender": "f"}), ("ega", {"tense": "future", "gender": "m"}),
    ("oge", {"tense": "future"}), ("unga", {"tense": "future"}), ("ungi", {"tense": "future"}),
    ("ge", {"tense": "future", "num": "pl"}), ("gi", {"tense": "future", "gender": "f"}),
    ("ga", {"tense": "future", "gender": "m"}),
    ("na", {"form": "infinitive"}), ("ni", {"form": "infinitive", "gender": "f"}),
    ("ne", {"form": "infinitive", "num": "pl"}),
    ("ta", {"tense": "present", "aspect": "habitual"}), ("ti", {"tense": "present", "aspect": "habitual"}),
    ("te", {"tense": "present", "aspect": "habitual"}),
    ("iye", {"mood": "imperative"}), ("o", {"mood": "imperative"}), ("ao", {"mood": "imperative"}),
    ("ya", {"tense": "past", "gender": "m"}), ("yi", {"tense": "past", "gender": "f"}),
    ("a", {"tense": "past", "gender": "m"}), ("i", {"tense": "past", "gender": "f"}),
    ("e", {"tense": "past", "num": "pl"}), ("", {}),
]
# Irregular / closed-class forms.
HI_LEMMA_TABLE: dict[str, tuple[str, dict]] = {
    "hua": ("hona", {"tense": "past"}), "hui": ("hona", {"tense": "past"}), "hue": ("hona", {"tense": "past"}),
    "tha": ("hona", {"tense": "past"}), "thi": ("hona", {"tense": "past"}),
    "hoga": ("hona", {"tense": "future"}), "hogi": ("hona", {"tense": "future"}),
    "honge": ("hona", {"tense": "future"}), "hai": ("hona", {"tense": "present"}),
    "hain": ("hona", {"tense": "present"}), "gaya": ("jana", {"tense": "past"}), "gayi": ("jana", {"tense": "past"}),
    "gaye": ("jana", {"tense": "past"}), "chahiye": ("chahiye", {"mood": "need"}),
    "chahiyega": ("chahiye", {"tense": "future"}), "kitni": ("kitna", {"gender": "f"}),
    "kitne": ("kitna", {"num": "pl"}), "agle": ("agla", {}), "agli": ("agla", {}), "pichle": ("pichla", {}),
    "pichli": ("pichla", {}), "hafte": ("hafta", {}), "mahine": ("mahina", {}), "kaunsi": ("kaunsa", {}),
    "kaunse": ("kaunsa", {}), "bachi": ("bachna", {"tense": "past"}), "bache": ("bachna", {"tense": "past"}),
    "bacha": ("bachna", {"tense": "past"}), "khana": ("khana", {}), "banana": ("banana", {"form": "infinitive"}),
    "pakani": ("pakana", {"form": "infinitive"}), "taiyari": ("taiyari", {}), "dal": ("dal", {}),
    "chana": ("chana", {}), "kamai": ("kamai", {}), "kal": ("kal", {}), "aaj": ("aaj", {}), "galla": ("galla", {}),
    "padega": ("padna", {"tense": "future"}), "lagega": ("lagna", {"tense": "future"}),
    "aayenge": ("aana", {"tense": "future"}), "jayengi": ("jana", {"tense": "future"}),
    "jayenge": ("jana", {"tense": "future"}), "mangao": ("mangwana", {"mood": "imperative"}),
    "kharab": ("kharab", {}), "tayyar": ("tayyar", {}), "anumaan": ("anumaan", {}),
}


def hindi_analyse(word: str) -> tuple[str, dict] | None:
    """(lemma, features) for a romanised Hindi word, or None if not recognised."""
    w = word.lower()
    if w in HI_LEMMA_TABLE:
        return HI_LEMMA_TABLE[w]
    for suf, feats in HI_VERB_SUFFIXES:
        if suf and not w.endswith(suf):
            continue
        stem = w[: len(w) - len(suf)] if suf else w
        if stem in HI_VERB_STEMS and len(stem) >= 2:
            return HI_VERB_STEMS[stem], dict(feats)
    return None


# =========================================================================== tense
_EN_FUTURE = {"will", "shall", "gonna", "expect", "expecting", "expected", "forecast", "predict", "tomorrow",
              "next", "upcoming", "coming", "need", "should", "plan"}
_EN_PAST = {"was", "were", "did", "had", "sold", "wasted", "threw", "thrown", "went", "made", "spoiled",
            "spoilt", "yesterday", "last", "ago", "got", "earned", "logged", "used", "past"}
_HI_PAST_CUE = {"pichla", "pichle", "pichli", "pehle"}
_HI_FUTURE_CUE = {"agla", "agle", "agli", "baad"}


def sentence_tense(norm_tokens: list[str]) -> str | None:
    """'past' | 'future' | None from English auxiliaries and Hindi verb morphology."""
    past = future = 0
    for w in norm_tokens:
        if w in _EN_FUTURE or w in _HI_FUTURE_CUE:
            future += 1
        if w in _EN_PAST or w in _HI_PAST_CUE:
            past += 1
        elif w.endswith("ed") and len(w) > 4:
            past += 1
        a = hindi_analyse(w)
        if a:
            feats = a[1]
            if feats.get("tense") == "past":
                past += 2
            elif feats.get("tense") == "future" or feats.get("mood") == "need":
                future += 2
            elif feats.get("form") == "infinitive":
                future += 1  # "banana hai", "mangwana hai" = obligation, i.e. upcoming
    if past > future:
        return "past"
    if future > past:
        return "future"
    return None


def lemma(word: str, lang_hint: str | None = None) -> tuple[str, dict]:
    """Lemma for any token: Hindi analysis first for Hinglish words, else Porter."""
    if lang_hint != "en":
        a = hindi_analyse(word)
        if a:
            return a
    if not word.isalpha():
        return word, {}
    return english_lemma(word), {}
