"""Unit 1 - Regular-expression based text normalisation.

Two layers:

1. `clean_text` - string-level regex rewrites applied before tokenising
   (unicode NFKC, zero-width characters, currency signs, "&" -> "and",
   elongated letters "sooo" -> "soo", spaced units "2 . 5 kg").
2. `normalize_tokens` - token-level rules: lower-casing, English
   contractions, and *Hinglish spelling normalisation*.

Hinglish has no standard spelling ("kitna/kitnaa/kitana", "zyada/jyada/
jada", "chahiye/chahie/chaiye"). We compute a phonetic key with a cascade of
regex rewrites (a Soundex-like rule system tuned for romanised Hindi) and map
every word whose key matches a canonical form in the lexicon to that form.
"""

from __future__ import annotations

import re
import unicodedata

from app.nlp.lexicon import HINGLISH_CANONICAL
from app.nlp.tokenizer import Token

_STRING_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"[​-‍﻿]"), ""),        # zero-width chars
    (re.compile(r"₹|\brs\.?(?=\s*\d)", re.I), " rs "),  # currency
    (re.compile(r"&"), " and "),
    (re.compile(r"([a-zA-Z])\1{2,}"), r"\1\1"),        # sooo -> soo, pleeease -> pleease
    (re.compile(r"(\d)\s*\.\s*(\d)"), r"\1.\2"),        # "2 . 5" -> "2.5"
    (re.compile(r"\s+"), " "),
]

_ELONGATED = re.compile(r"([a-z])\1{2,}")

_CONTRACTIONS = {
    "what's": "what is", "how's": "how is", "it's": "it is", "that's": "that is",
    "don't": "do not", "didn't": "did not", "won't": "will not", "can't": "can not",
    "isn't": "is not", "aren't": "are not", "we're": "we are", "i'm": "i am", "let's": "let us",
    "we'll": "we will", "i'll": "i will", "there's": "there is",
}

# Ordered rewrite cascade that maps spelling variants to one key.
_KEY_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"ph"), "f"),
    (re.compile(r"w"), "v"),
    (re.compile(r"z"), "j"),
    (re.compile(r"q"), "k"),
    (re.compile(r"ck"), "k"),
    (re.compile(r"ee|ii"), "i"),
    (re.compile(r"oo|uu"), "u"),
    (re.compile(r"aa"), "a"),
    (re.compile(r"(?<=[^aeiou])y(?=[aeiou]|$)"), ""),     # pyaj -> paj
    (re.compile(r"iy(?=[aeiou])"), "i"),                  # chahiye -> chahie
    (re.compile(r"(?<=[aeiou])h(?=[aeiou])"), ""),        # chahie -> chaie
    (re.compile(r"(?<=[a-z])h(?=[aeiou]?$)"), ""),        # pyaaz/pyaj, -h endings
    (re.compile(r"([b-df-hj-np-tv-z])\1"), r"\1"),        # kittna -> kitna
    (re.compile(r"(?<=[^aeiou])a(?=[^aeiou])"), ""),      # schwa: kitana -> kitna
    (re.compile(r"(?<=.)[aeiou](?=[aeiou])"), ""),        # vowel clusters ie -> e
]


# Irregular short forms that no rewrite rule can recover.
_VARIANTS = {
    "aj": "aaj", "kl": "kal", "h": "hai", "hy": "hai", "nhi": "nahi", "nai": "nahi",
    "parson": "parso", "parsoo": "parso", "mai": "mein", "mei": "mein", "kitne": "kitne",
    "plz": "please", "pls": "please", "tmrw": "tomorrow", "tmr": "tomorrow", "2moro": "tomorrow",
    "yday": "yesterday", "hii": "hi", "helo": "hello", "hlo": "hello", "thx": "thanks", "wk": "week", "qty": "quantity", "u": "you", "r": "are", "ur": "your",
}


def hinglish_key(word: str) -> str:
    """Phonetic key of a romanised Hindi word (spelling-variant invariant)."""
    k = word.lower()
    for pat, rep in _KEY_RULES:
        k = pat.sub(rep, k)
    return k


_CANON_BY_KEY: dict[str, str] = {}
for _w in HINGLISH_CANONICAL:
    _CANON_BY_KEY.setdefault(hinglish_key(_w), _w)


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    for pat, rep in _STRING_RULES:
        text = pat.sub(rep, text)
    return text.strip()


def canonical_hinglish(word: str, english_vocab: set[str] | None = None) -> str | None:
    """Canonical Hinglish spelling for `word`, or None when it is not one.

    Known English words are never rewritten (so "the" does not become "thi").
    """
    if english_vocab and word in english_vocab:
        return None
    if word in _VARIANTS:
        return _VARIANTS[word]
    if word in HINGLISH_CANONICAL:
        return word
    if len(word) < 3:
        return None
    return _CANON_BY_KEY.get(hinglish_key(word))


def expand_contractions(tokens: list[Token]) -> list[Token]:
    """"what's" -> "what" "is" (both tokens keep the original offsets)."""
    out: list[Token] = []
    for t in tokens:
        exp = _CONTRACTIONS.get(t.text.lower())
        if exp:
            out.extend(Token(t.text, t.start, t.end, "WORD", norm=w) for w in exp.split())
        else:
            out.append(t)
    return out


def normalize_tokens(tokens: list[Token], english_vocab: set[str] | None = None) -> list[str]:
    """Fill `tok.norm` in place; returns a list of applied rewrites for debugging."""
    changes: list[str] = []
    for t in tokens:
        if t.kind == "NUM":
            continue
        w = _ELONGATED.sub(r"\1\1", t.norm.lower())
        canon = canonical_hinglish(w, english_vocab)
        if canon and canon != w:
            changes.append(f"{w}->{canon}")
            w = canon
        t.norm = w
    return changes
