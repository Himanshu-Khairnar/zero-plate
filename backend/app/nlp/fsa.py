"""Unit 1/2 - Finite-state recogniser for quantities, units and dates.

A deterministic finite automaton runs over *token classes* (not characters):
each normalised token is mapped to one symbol of the input alphabet

    NUM 2.5 / 10         HINUM do / teen / seven   UNIT kg / litre / plates
    REL today / kal      WDAY friday / shukravar  NEXT next / agle / coming
    LAST last / pichle   THIS this / is           PER week / hafta / month
    WKND weekend         DAYS days / din          DAY day   AFTER after
    BEFORE before        TOD night / subah        OTHER everything else

and the scanner returns the longest accepting run starting at each position
(maximal munch). The transition table is written out explicitly below so it
can be drawn as a state diagram. Ambiguity is handled by the automaton
itself: Hindi "do" (2) and Hinglish "is" (this) only reach an accepting
state when a unit / period follows, so the English words "do" and "is" are
never mis-read.

Each accepted span is then *interpreted* into a value: quantities become a
float, units a canonical unit, dates a relative offset/range. The Hindi words
"kal" and "parso" mean both yesterday/tomorrow and the day before
yesterday/after tomorrow; they are resolved with the sentence tense from
morphology.sentence_tense.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.nlp.lexicon import EN_NUMBERS, HI_NUMBERS, UNITS

REL = {"today": 0, "tonight": 0, "aaj": 0, "tomorrow": 1, "yesterday": -1, "kal": None, "parso": None, "now": 0}
WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3, "thurs": 3, "fri": 4, "sat": 5, "sun": 6,
    "somvar": 0, "mangalvar": 1, "budhvar": 2, "guruvar": 3, "shukravar": 4, "shanivar": 5, "ravivar": 6,
}
NEXT = {"next", "coming", "upcoming", "agle", "agla", "agli", "following"}
LAST = {"last", "past", "previous", "pichle", "pichla", "pichli"}
THIS = {"this", "is", "current"}
PERIODS = {"week": 7, "hafte": 7, "hafta": 7, "month": 30, "mahine": 30, "mahina": 30, "year": 365, "saal": 365,
           "fortnight": 14}
DAYS = {"days", "din", "dino"}
TOD = {"night", "morning", "evening", "afternoon", "raat", "subah", "shaam", "lunch", "dinner", "breakfast"}


def token_class(w: str) -> str:
    if _is_number(w):
        return "NUM"
    if w in HI_NUMBERS or (w in EN_NUMBERS and w != "a"):
        return "HINUM"  # number *word*: only accepted when a unit/period follows
    if w in UNITS:
        return "UNIT"
    if w in REL:
        return "REL"
    if w in WEEKDAYS:
        return "WDAY"
    if w in NEXT:
        return "NEXT"
    if w in LAST:
        return "LAST"
    if w in THIS:
        return "THIS"
    if w in PERIODS:
        return "PER"
    if w == "weekend":
        return "WKND"
    if w in DAYS:
        return "DAYS"
    if w == "day":
        return "DAY"
    if w == "after":
        return "AFTER"
    if w == "before":
        return "BEFORE"
    if w in TOD:
        return "TOD"
    return "OTHER"


def _is_number(w: str) -> bool:
    try:
        float(w)
        return True
    except ValueError:
        return False


# --------------------------------------------------------------------------- the DFA
# state -> {symbol -> next state}; ACCEPT maps accepting states to the entity kind.
TRANSITIONS: dict[str, dict[str, str]] = {
    "q0": {"NUM": "n", "HINUM": "hn", "REL": "rel", "WDAY": "wd", "NEXT": "mod", "LAST": "mod",
           "THIS": "mod", "WKND": "wk", "DAY": "d1"},
    "n": {"UNIT": "qty", "DAYS": "ndays", "PER": "ndays"},
    "hn": {"UNIT": "qty", "DAYS": "ndays", "PER": "ndays"},
    "rel": {"TOD": "rel_tod"},
    "wd": {"TOD": "wd_tod"},
    "mod": {"WDAY": "wd", "PER": "per", "WKND": "wk", "NUM": "modn", "HINUM": "modn", "DAYS": "per"},
    "modn": {"DAYS": "per", "PER": "per"},
    "d1": {"AFTER": "d2a", "BEFORE": "d2b"},
    "d2a": {"REL": "rel"},
    "d2b": {"REL": "rel"},
}
ACCEPT: dict[str, str] = {
    "n": "QTY", "qty": "QTY", "ndays": "DATE", "rel": "DATE", "rel_tod": "DATE", "wd": "DATE",
    "wd_tod": "DATE", "per": "DATE", "wk": "DATE",
}


@dataclass
class Match:
    start: int        # token index (inclusive)
    end: int          # token index (exclusive)
    kind: str         # QTY | DATE
    states: list[str]


def scan(words: list[str]) -> list[Match]:
    """Longest-match scan of the DFA over a list of normalised tokens."""
    syms = [token_class(w) for w in words]
    out: list[Match] = []
    i = 0
    while i < len(words):
        state, path, best = "q0", ["q0"], None
        j = i
        while j < len(words):
            nxt = TRANSITIONS.get(state, {}).get(syms[j])
            if nxt is None:
                break
            state = nxt
            path.append(state)
            j += 1
            if state in ACCEPT:
                best = Match(i, j, ACCEPT[state], list(path))
        if best:
            out.append(best)
            i = best.end
        else:
            i += 1
    return out


# --------------------------------------------------------------------------- interpretation
def number_value(w: str) -> float | None:
    if _is_number(w):
        return float(w)
    return EN_NUMBERS.get(w, HI_NUMBERS.get(w))


def interpret_qty(words: list[str]) -> tuple[float | None, str | None]:
    """('2.5', 'kg') -> (2.5, 'kg')."""
    num = number_value(words[0])
    unit = UNITS.get(words[1]) if len(words) > 1 else None
    return num, unit


def _range(today: date, start_off: int, days: int, direction: str, label: str) -> dict:
    s = today + timedelta(days=start_off)
    return {"kind": "range" if days > 1 else "day", "offset": start_off, "days": days, "direction": direction,
            "start": s.isoformat(), "end": (s + timedelta(days=days - 1)).isoformat(), "label": label}


def interpret_date(words: list[str], today: date, tense: str | None) -> dict | None:
    """Turn an accepted DATE span into {offset, days, direction, start, end}."""
    label = " ".join(words)
    syms = [token_class(w) for w in words]
    past = tense == "past"
    if syms[0] == "DAY":  # day after tomorrow / day before yesterday
        return _range(today, 2 if syms[1] == "AFTER" else -2, 1, "future" if syms[1] == "AFTER" else "past", label)
    if syms[0] == "REL":
        w = words[0]
        if w == "kal":
            off = -1 if past else 1
        elif w == "parso":
            off = -2 if past else 2
        else:
            off = REL[w]
        return _range(today, off, 1, "past" if off < 0 else "future" if off > 0 else "present", label)
    if "WDAY" in syms:
        wd = WEEKDAYS[words[syms.index("WDAY")]]
        direction = "past" if syms[0] == "LAST" or (syms[0] != "NEXT" and past) else "future"
        if direction == "future":
            delta = (wd - today.weekday()) % 7
            if syms[0] == "NEXT" and delta == 0:
                delta = 7
        else:
            delta = -((today.weekday() - wd) % 7 or 7)
        return _range(today, delta, 1, direction, label)
    if "WKND" in syms:
        to_sat = (5 - today.weekday()) % 7
        if syms[0] == "LAST" or (syms[0] != "NEXT" and past):
            back = (today.weekday() - 5) % 7 or 7
            return _range(today, -back, 2, "past", label)
        if syms[0] != "NEXT" and today.weekday() == 6 and tense != "future":  # Sunday: "this weekend" = today
            return _range(today, 0, 1, "present", label)
        if syms[0] == "NEXT" and to_sat == 0:
            to_sat = 7
        return _range(today, to_sat, 2, "future", label)
    # periods: "last week", "agle hafte", "pichle 10 din", "7 days", "is mahine"
    n = 1
    for w, s in zip(words, syms):
        if s in ("NUM", "HINUM"):
            n = int(number_value(w) or 1)
    unit_days = 1
    for w, s in zip(words, syms):
        if s == "PER":
            unit_days = PERIODS[w]
    days = max(1, min(365, n * unit_days))
    if syms[0] == "NEXT" or (syms[0] != "LAST" and not past and syms[0] != "THIS" and tense == "future"):
        return _range(today, 1, days, "future", label)
    if syms[0] == "THIS" and tense == "future":
        return _range(today, 1, days, "future", label)
    return _range(today, -(days - 1), days, "past", label)
