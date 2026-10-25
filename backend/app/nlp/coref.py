"""Unit 6 - Discourse: anaphora and ellipsis resolution over the chat history.

Chat questions are short and lean on the previous turn:

    U1: how much paneer do we have         U1: what do we expect to sell tomorrow
    U2: how much of it should I order      U2: and day after tomorrow?
        (it = paneer: pronominal anaphora)     (elliptical follow-up: forecast)

Pronoun resolution (Hobbs-inspired search, centering-style salience)
-------------------------------------------------------------------
Anaphors: it / that / this / them / same / then, Hinglish uska / iska /
usko / woh / wo / yeh. The previous *user* turns are searched from the most
recent backwards (Hobbs walks back sentence by sentence) and, inside a turn,
left to right (Hobbs's breadth-first, left-to-right tree walk prefers
subjects/topics, the first mentioned entity). Candidates must agree with the
anaphor - only DISH or INGREDIENT entities can be "it" - and with the
*selectional restriction* of the current intent: purchase/stock questions
want an ingredient, forecast/prep/sales/waste want a dish (centering's
"preferred centre" for that utterance). Salience of a candidate is

    score = recency (1 / (1 + turns back)) * position (1 / (1 + rank in turn))
            * agreement (1.0 if the type matches the intent's preferred type, else 0.5)

and the highest score wins.

Ellipsis: an utterance is a *fragment* if it starts with a continuation cue
("and", "aur", "what about", "how about", "or", "also") and is short (<= 4
words) or classified with low confidence, or is a very short low-confidence
utterance on its own ("why"). A fragment inherits the previous turn's
intent and slots; slots it does mention override the inherited ones of the
same type ("and milk?" replaces the ingredient, "and tomorrow?" the date).
"""

from __future__ import annotations

from app.nlp.lexicon import ANAPHORS

CONTINUATION = [("what", "about"), ("how", "about"), ("and",), ("aur",), ("or",), ("also",), ("then",), ("phir",)]
PREFERRED_TYPE = {"purchase": "INGREDIENT", "stock": "INGREDIENT", "forecast": "DISH", "prep": "DISH",
                  "sales": "DISH", "waste": "DISH"}
_EN_ONLY_PRONOUNS = {"it", "that", "this", "them", "those", "these", "same", "then"}
_HI_PRONOUNS = {w for w, lang in ANAPHORS.items() if lang == "hi"}


def find_anaphors(words: list[str], tags: list[str], lang: str) -> list[int]:
    out = []
    for i, (w, t) in enumerate(zip(words, tags)):
        if t != "O":
            continue
        if w in _EN_ONLY_PRONOUNS:
            # "this week" / "that day" are determiners of a date, not anaphors
            if i + 1 < len(tags) and tags[i + 1] != "O":
                continue
            out.append(i)
        elif w in _HI_PRONOUNS and lang != "en" and w not in ("ye", "yeh", "use"):
            out.append(i)
        elif w == "use" and lang != "en":
            out.append(i)
    return out


def is_fragment(words: list[str], confidence: float, intent: str) -> bool:
    if not words:
        return False
    for cue in CONTINUATION:
        if tuple(words[: len(cue)]) == cue:
            # "and how much of it was wasted" is a full question, not a fragment
            return len(words) <= 4 or confidence < 0.6 or intent in ("help", "unknown")
    if len(words) <= 2 and not (intent == "help" and confidence >= 0.5):
        return True  # "why", "kitna?" - but not "thanks"
    return len(words) <= 3 and (confidence < 0.6 or intent in ("help", "unknown"))


def _entity_slots(entities: list[dict]) -> dict[str, dict]:
    slots: dict[str, dict] = {}
    for e in entities:
        slots.setdefault(e["type"], e)
    return slots


def resolve(current: dict, history: list[dict]) -> dict:
    """`current` / `history` items: {"words","tags","entities","intent","confidence","lang"}.

    `history` is ordered oldest -> newest and contains previous *user* turns
    already resolved (each with its own "resolved" dict).
    """
    words, tags = current["words"], current["tags"]
    intent, conf = current["intent"], current["confidence"]
    slots = _entity_slots(current["entities"])
    out = {"intent": intent, "confidence": conf, "ellipsis": False, "inheritedIntent": False,
           "antecedents": [], "slots": {}}
    prev = history[-1]["resolved"] if history else None

    if prev and is_fragment(words, conf, intent):
        out["ellipsis"] = True
        # A fragment that names a slot type the previous intent does not use
        # still keeps the previous intent ("and for paneer tikka?").
        out["intent"], out["confidence"] = prev["intent"], prev["confidence"]
        out["inheritedIntent"] = True
        inherited = dict(prev["slots"])
        for typ, ent in slots.items():
            if typ in ("DISH", "INGREDIENT"):
                inherited.pop("DISH", None)
                inherited.pop("INGREDIENT", None)
            inherited[typ] = ent
        out["slots"] = inherited
    else:
        out["slots"] = dict(slots)

    # Pronouns (also inside fragments: "order it") that still lack a referent.
    anaphors = find_anaphors(words, tags, current.get("lang", "en"))
    if anaphors and history and not ({"DISH", "INGREDIENT"} & set(out["slots"])):
        want = PREFERRED_TYPE.get(out["intent"])
        best, best_score = None, 0.0
        for back, turn in enumerate(reversed(history)):
            cands = [e for e in turn["resolved"]["slots"].values() if e["type"] in ("DISH", "INGREDIENT")]
            cands.sort(key=lambda e: e.get("start", 0))
            for rank, e in enumerate(cands):
                score = (1 / (1 + back)) * (1 / (1 + rank)) * (1.0 if want in (None, e["type"]) else 0.5)
                if score > best_score:
                    best, best_score = (e, back), score
        if best:
            ent, back = best
            out["slots"][ent["type"]] = ent
            out["antecedents"].append({"anaphor": words[anaphors[0]], "index": anaphors[0],
                                       "resolvedTo": ent.get("value") or ent["text"], "type": ent["type"],
                                       "turnsBack": back + 1, "salience": round(best_score, 3)})
    # Unknown/help with a pronoun and a previous intent ("order it"): the
    # classifier already decides intent; nothing to inherit.
    return out
