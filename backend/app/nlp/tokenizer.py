"""Unit 1 - Tokenisation for English, Hinglish and (lightly) Devanagari text.

The tokenizer is a single ordered regular expression (a maximal-munch
lexer). Alternatives are tried left to right, so more specific patterns come
first:

    DECIMAL   2.5, 0.75          numbers stay one token
    NUMUNIT   2.5kg, 500gm        split into NUM + UNIT tokens afterwards
    WORD      paneer, don't, k's  letters with internal apostrophes
    DEVA      कितना               a run of Devanagari letters + signs
    PUNCT     ? ! , .             kept so the LM sees sentence boundaries

Every token keeps its character offsets into the *original* string, so the
entities reported by the API point back at what the user typed.

Devanagari words are transliterated to Hinglish Latin spelling with a small
character table (consonant + inherent "a", vowel signs, virama and final
schwa deletion). The result is approximate ("कितना" -> "kitana"); the
spelling-normalisation step then maps it to the canonical "kitna".
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

_TOKEN_RE = re.compile(
    r"""
    (?P<NUMUNIT>\d+(?:\.\d+)?(?=[a-zA-Z]{1,9}\b))   # 2.5 of 2.5kg (unit lexed next)
  | (?P<DECIMAL>\d+(?:[.,]\d+)?)
  | (?P<WORD>[a-zA-Z]+(?:'[a-zA-Z]+)*)
  | (?P<DEVA>[ऀ-ॿ]+)
  | (?P<PUNCT>[?!.,;:])
    """,
    re.VERBOSE,
)


@dataclass
class Token:
    text: str          # surface form as typed
    start: int         # offsets into the original string
    end: int
    kind: str          # NUM | WORD | DEVA | PUNCT
    norm: str = ""     # normalised form (filled by normalize.py)
    lemma: str = ""    # filled by morphology.py
    feats: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.norm:
            self.norm = self.text.lower()


def tokenize(text: str) -> list[Token]:
    """Split `text` into tokens with offsets (no normalisation beyond NFC)."""
    text = unicodedata.normalize("NFC", text)
    out: list[Token] = []
    for m in _TOKEN_RE.finditer(text):
        kind = m.lastgroup or "WORD"
        s, e = m.span()
        surface = m.group()
        if kind in ("NUMUNIT", "DECIMAL"):
            out.append(Token(surface, s, e, "NUM", norm=surface.replace(",", ".")))
        elif kind == "DEVA":
            latin = transliterate(surface)
            out.append(Token(surface, s, e, "DEVA", norm=_DEVA_LOANWORDS.get(latin, latin)))
        else:
            out.append(Token(surface, s, e, kind))
    return out


# --------------------------------------------------------------------------- Devanagari
# English loanwords written in Devanagari come out of the transliterator in a
# Hindi spelling; map the common kitchen ones back.
_DEVA_LOANWORDS = {
    "vest": "waste", "vestej": "wastage", "stak": "stock", "stok": "stock", "sel": "sale",
    "sels": "sales", "forakast": "forecast", "phorakast": "forecast", "plet": "plate",
    "ordar": "order", "ardar": "order", "aurdar": "order", "prep": "prep", "plan": "plan",
    "kilo": "kilo", "kiloo": "kilo",
}
_VOWELS = {
    "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ए": "e", "ऐ": "ai", "ओ": "o",
    "औ": "au", "ऋ": "ri",
}
_SIGNS = {  # dependent vowel signs (matras)
    "ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
    "ृ": "ri",
}
_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j",
    "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t",
    "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh",
    "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "फ़": "f", "ड़": "d", "ढ़": "dh",
}
_VIRAMA, _ANUSVARA, _CHANDRA, _NUKTA, _VISARGA = "्", "ं", "ँ", "़", "ः"
_DIGITS = {chr(0x0966 + i): str(i) for i in range(10)}


def transliterate(word: str) -> str:
    """Approximate Devanagari -> Hinglish Latin transliteration."""
    word = unicodedata.normalize("NFC", word)
    out: list[str] = []
    i = 0
    while i < len(word):
        ch = word[i]
        nxt = word[i + 1] if i + 1 < len(word) else ""
        if nxt == _NUKTA:  # composed form of nukta consonants
            ch, i = ch + nxt, i + 1
            nxt = word[i + 1] if i + 1 < len(word) else ""
        if ch in _CONSONANTS:
            out.append(_CONSONANTS[ch])
            if nxt == _VIRAMA:
                i += 1
            elif nxt in _SIGNS:
                out.append(_SIGNS[nxt])
                i += 1
            else:
                out.append("a")  # inherent vowel
        elif ch in _VOWELS:
            out.append(_VOWELS[ch])
        elif ch in (_ANUSVARA, _CHANDRA):
            out.append("n")
        elif ch in _DIGITS:
            out.append(_DIGITS[ch])
        elif ch == _VISARGA:
            out.append("h")
        i += 1
    s = "".join(out)
    # Final schwa deletion: कल -> "kala" -> "kal" (but keep "aa"-final words).
    if len(s) > 2 and s.endswith("a") and not s.endswith("aa") and word[-1] in _CONSONANTS:
        s = s[:-1]
    return s
