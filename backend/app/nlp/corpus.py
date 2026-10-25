"""Loading the bracket-annotated dataset and the shared text front-end.

`parse_bracketed("[kal|DATE] kitna [paneer|ING] chahiye")` returns the plain
sentence and the character spans of its slots; `bio_tags` aligns those spans
to tokenizer tokens as BIO tags (B-DATE, I-DATE, O, ...), giving the
supervised corpus for the HMM tagger.

`front_end` is the deterministic part of the pipeline shared by training and
inference: tokenize -> expand contractions -> regex/Hinglish normalisation.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from app.nlp.lexicon import EN_STOP, UNITS
from app.nlp.normalize import clean_text, expand_contractions, normalize_tokens
from app.nlp.tokenizer import Token, tokenize

DATA_DIR = Path(__file__).with_name("data")
TAG_TYPES = ["DISH", "ING", "QTY", "UNIT", "DATE"]
TAGS = ["O"] + [f"{p}-{t}" for t in TAG_TYPES for p in ("B", "I")]

_BRACKET = re.compile(r"\[([^\]|]+)\|([A-Z]+)\]")


@dataclass
class Example:
    text: str
    intent: str
    lang: str
    split: str
    source: str
    spans: list[tuple[int, int, str]]
    tokens: list[Token] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)

    @property
    def words(self) -> list[str]:
        return [t.norm for t in self.tokens]


def parse_bracketed(s: str) -> tuple[str, list[tuple[int, int, str]]]:
    out, spans, pos = [], [], 0
    for m in _BRACKET.finditer(s):
        out.append(s[pos:m.start()])
        start = sum(len(x) for x in out)
        out.append(m.group(1))
        spans.append((start, start + len(m.group(1)), m.group(2)))
        pos = m.end()
    out.append(s[pos:])
    return "".join(out), spans


def bio_tags(tokens: list[Token], spans: list[tuple[int, int, str]]) -> list[str]:
    tags = ["O"] * len(tokens)
    for s, e, typ in spans:
        first = True
        for i, t in enumerate(tokens):
            if t.start >= s and t.end <= e:
                tags[i] = ("B-" if first else "I-") + typ
                first = False
    return tags


def spans_from_tags(tags: list[str]) -> list[tuple[int, int, str]]:
    """BIO tags -> [(first_token, last_token_exclusive, TYPE)]."""
    out, cur = [], None
    for i, t in enumerate(tags + ["O"]):
        if t == "O" or t.startswith("B-") or (cur and t[2:] != cur[2]):
            if cur:
                out.append((cur[0], i, cur[2]))
                cur = None
        if t.startswith("B-") or (t.startswith("I-") and cur is None):
            cur = (i, i, t[2:])
    return out


def front_end(text: str, english_vocab: set[str] | None = None) -> tuple[str, list[Token], list[str]]:
    """tokenize -> contractions -> normalise. Returns (cleaned text, tokens, rewrites).

    Tokens are taken from the *original* string so their offsets point at what
    the user typed; the string-level clean-up is applied per token instead.
    """
    clean = clean_text(text)
    toks = [t for t in expand_contractions(tokenize(text)) if t.kind != "PUNCT"]
    changes = normalize_tokens(toks, english_vocab)
    return clean, toks, changes


@lru_cache(maxsize=1)
def english_vocab() -> frozenset[str]:
    """Words seen in English training sentences (guards Hinglish respelling)."""
    words = set(EN_STOP) | set(UNITS)
    for r in _raw_rows():
        if r["lang"] == "en" and r["split"] == "train":
            plain, _ = parse_bracketed(r["text"])
            words.update(t.text.lower() for t in tokenize(plain) if t.kind == "WORD")
    return frozenset(words)


@lru_cache(maxsize=1)
def _raw_rows() -> tuple[dict, ...]:
    with (DATA_DIR / "intents.jsonl").open(encoding="utf-8") as f:
        return tuple(json.loads(line) for line in f if line.strip())


@lru_cache(maxsize=1)
def load_dataset() -> tuple[Example, ...]:
    ev = set(english_vocab())
    out = []
    for r in _raw_rows():
        plain, spans = parse_bracketed(r["text"])
        _, toks, _ = front_end(plain, ev)
        # front_end cleans the text; offsets still match because clean_text only
        # collapses whitespace in this dataset (asserted in tests).
        ex = Example(plain, r["intent"], r["lang"], r["split"], r["source"], spans, toks, bio_tags(toks, spans))
        out.append(ex)
    return tuple(out)


def split(name: str) -> list[Example]:
    return [e for e in load_dataset() if e.split == name]


def load_json(name: str):
    with (DATA_DIR / name).open(encoding="utf-8") as f:
        return json.load(f)
