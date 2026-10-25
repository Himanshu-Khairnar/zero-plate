"""The NLP pipeline behind POST /api/nlp/parse.

    text
     |  normalize.clean_text            regex clean-up                       (Unit 1)
     |  tokenizer.tokenize              EN / Hinglish / Devanagari tokens    (Unit 1)
     |  normalize.normalize_tokens      Hinglish spelling variants           (Unit 1)
     |  spell.SpellCorrector            noisy channel + bigram LM            (Unit 2)
     |  morphology.sentence_tense       Porter + Hindi suffix analysis       (Unit 2)
     |  fsa.scan / hmm.viterbi          DFA dates & quantities, HMM slots    (Unit 1-3)
     |  gazetteer.resolve + embeddings  canonical names, synonyms            (Unit 5)
     |  wsd.lesk                        sense of plate / order / stock / kal (Unit 4)
     |  intent classifier               NB / TF-IDF / kNN / PPMI ensemble    (Unit 4-5)
     |  langid                          char n-gram language ID              (Unit 1)
     v  coref.resolve                   anaphora + ellipsis over history     (Unit 6)
    {intent, confidence, entities, resolved, ...}

All models are trained from the files in app/nlp/data the first time they
are needed (about a second) and cached for the life of the process.
"""

from __future__ import annotations

import json
import random
import threading
import time
from dataclasses import dataclass
from datetime import date
from functools import lru_cache

from app.nlp import coref
from app.nlp.classifiers import (CentroidClassifier, EmbeddingCentroid, KNNClassifier, MaxEntClassifier,
                                 MultinomialNB, TfidfVectorizer, average)
from app.nlp.corpus import DATA_DIR, Example, english_vocab, front_end, spans_from_tags, split
from app.nlp.embeddings import PPMIEmbeddings, code_switch, seed_split
from app.nlp.features import embedding_tokens, intent_features
from app.nlp.fsa import interpret_date, interpret_qty, scan
from app.nlp.gazetteer import Gazetteer
from app.nlp.hmm import HMMTagger
from app.nlp.langid import CharNgramLangID, build_langid, sentence_language
from app.nlp.lexicon import COMMON_EN, EN_NUMBERS, EN_STOP, HI_EN, HI_NUMBERS, HI_STOP, HINGLISH_CANONICAL, UNITS
from app.nlp.lm import NgramLM
from app.nlp.morphology import sentence_tense
from app.nlp.spell import SpellCorrector
from app.nlp import fsa as fsa_mod
from app.nlp.wsd import disambiguate

ENTITY_TYPE = {"DISH": "DISH", "ING": "INGREDIENT", "QTY": "QTY", "UNIT": "UNIT", "DATE": "DATE"}
DEFAULT_THRESHOLD = 0.6
CLASSIFIERS = ["naive_bayes", "maxent", "tfidf_centroid", "tfidf_knn", "ppmi_centroid", "ensemble"]


# =========================================================================== tagging
def hybrid_tags(words: list[str], gaz: Gazetteer, hmm: HMMTagger, known: set[str] | None = None) -> list[str]:
    """DFA for QTY/UNIT/DATE, gazetteer longest match for known names, HMM for the rest.

    An HMM-only DISH/ING span is accepted only when its words are genuinely
    unknown (not ordinary English/Hinglish vocabulary), i.e. a name the menu
    lists do not contain.
    """
    tags = ["O"] * len(words)
    for m in scan(words):
        if m.kind == "QTY":
            tags[m.start] = "B-QTY"
            for k in range(m.start + 1, m.end):
                tags[k] = "B-UNIT"
        else:
            for k in range(m.start, m.end):
                tags[k] = ("B-" if k == m.start else "I-") + "DATE"
    for s, e, typ in gaz.longest_matches(words):
        if all(t == "O" for t in tags[s:e]):
            for k in range(s, e):
                tags[k] = ("B-" if k == s else "I-") + typ
    hmm_tags = hmm.tag(words, gaz)
    for s, e, typ in spans_from_tags(hmm_tags):
        if typ in ("DISH", "ING") and all(t == "O" for t in tags[s:e]):
            if all(w not in (known or set()) and w not in EN_STOP and w not in HI_STOP and w.isalpha()
                   for w in words[s:e]):
                for k in range(s, e):
                    tags[k] = ("B-" if k == s else "I-") + typ
    return tags


# =========================================================================== models
@dataclass
class IntentModel:
    name: str
    nb: MultinomialNB
    vec: TfidfVectorizer
    centroid: CentroidClassifier
    knn: KNNClassifier
    emb: EmbeddingCentroid
    maxent: MaxEntClassifier

    def proba(self, feats: list[str], emb_tokens: list[str], which: str | None = None) -> dict[str, float]:
        which = which or self.name
        if which == "naive_bayes":
            return self.nb.predict_proba(feats)
        x = self.vec.transform_one(feats)
        if which == "maxent":
            return self.maxent.predict_proba(x)
        if which == "tfidf_centroid":
            return self.centroid.predict_proba(x)
        if which == "tfidf_knn":
            return self.knn.predict_proba(x)
        if which == "ppmi_centroid":
            return self.emb.predict_proba(emb_tokens)
        # ensemble of the three strongest, structurally different members
        return average([self.nb.predict_proba(feats), self.maxent.predict_proba(x), self.centroid.predict_proba(x)])


def fit_intent_model(docs: list[list[str]], emb_docs: list[list[str]], labels: list[str], emb: PPMIEmbeddings,
                     name: str = "ensemble") -> IntentModel:
    vec = TfidfVectorizer().fit(docs)
    X = vec.transform(docs)
    return IntentModel(name, MultinomialNB().fit(docs, labels), vec, CentroidClassifier().fit(X, labels),
                       KNNClassifier().fit(X, labels), EmbeddingCentroid(emb).fit(emb_docs, labels),
                       MaxEntClassifier().fit(X, labels))


def stratified_dev(examples: list[Example], frac: float = 0.2, seed: int = 3) -> tuple[list[Example], list[Example]]:
    rng = random.Random(seed)
    fit, dev = [], []
    by: dict[str, list[Example]] = {}
    for e in examples:
        by.setdefault(e.intent, []).append(e)
    for intent in sorted(by):
        items = list(by[intent])
        rng.shuffle(items)
        k = max(1, round(len(items) * frac))
        dev += items[:k]
        fit += items[k:]
    return fit, dev


class Models:
    def __init__(self) -> None:
        t0 = time.perf_counter()
        self.english_vocab = set(english_vocab())
        self.gaz = Gazetteer()
        self.train = split("train")
        gaz_words = [w.lower() for n in self.gaz.dishes + self.gaz.ingredients for w in n.replace("(", " ").replace(")", " ").split()]
        # ---- language model + spelling (Unit 2)
        lm_corpus = [e.words for e in self.train] + [n.lower().replace("(", "").replace(")", "").split()
                                                     for n in self.gaz.dishes + self.gaz.ingredients]
        fsa_words = set(fsa_mod.REL) | set(fsa_mod.WEEKDAYS) | fsa_mod.NEXT | fsa_mod.LAST | fsa_mod.THIS | set(
            fsa_mod.PERIODS) | fsa_mod.DAYS | fsa_mod.TOD | {"day", "after", "before", "weekend"}
        self.spell_vocab = (self.english_vocab | set(gaz_words) | set(HI_EN) | set(HINGLISH_CANONICAL) | set(UNITS)
                            | EN_STOP | HI_STOP | set(EN_NUMBERS) | set(HI_NUMBERS) | fsa_words
                            | {w for e in self.train for w in e.words} | COMMON_EN
                            | {"tomato", "onion", "potato", "chickpea", "vegetable", "egg"})
        # every vocabulary word gets a pseudo-count of one in the LM so the
        # noisy-channel prior can rank words absent from the questions
        self.lm = NgramLM(order=2, min_count=1).fit(lm_corpus + [[w] for w in sorted(self.spell_vocab)])
        self.speller = SpellCorrector(self.spell_vocab, self.lm)
        self.known_words = self.spell_vocab - set(gaz_words)
        # ---- tagger (Unit 3)
        self.hmm = HMMTagger().fit([(e.words, e.tags) for e in self.train], self.gaz)
        # ---- language ID (Unit 1)
        self.neutral = set(gaz_words) | set(UNITS) | set(HI_NUMBERS) | set(EN_NUMBERS)
        self.langid: CharNgramLangID = build_langid(self.train, self.neutral)
        # ---- embeddings (Unit 5)
        seed_dict, _ = seed_split()
        emb_sents = [embedding_tokens(e.words) for e in self.train]
        self.embeddings = PPMIEmbeddings().fit(code_switch(emb_sents, seed_dict))
        # ---- intent classifiers (Unit 4/5), selected on a dev split of train
        analysed = {id(e): self._train_features(e) for e in self.train}
        fit, dev = stratified_dev(self.train)
        dev_model = fit_intent_model([analysed[id(e)][0] for e in fit], [analysed[id(e)][1] for e in fit],
                                     [e.intent for e in fit], self.embeddings)
        self.dev_accuracy = {}
        for name in CLASSIFIERS:
            ok = 0
            for e in dev:
                p = dev_model.proba(*analysed[id(e)], which=name)
                ok += max(p, key=p.get) == e.intent
            self.dev_accuracy[name] = round(ok / len(dev), 4)
        best = max(CLASSIFIERS, key=lambda n: (self.dev_accuracy[n], n == "ensemble"))
        self.intent = fit_intent_model([analysed[id(e)][0] for e in self.train],
                                       [analysed[id(e)][1] for e in self.train],
                                       [e.intent for e in self.train], self.embeddings, best)
        self.threshold = _load_threshold()
        self.train_seconds = round(time.perf_counter() - t0, 3)

    def _train_features(self, e: Example) -> tuple[list[str], list[str]]:
        tags = hybrid_tags(e.words, self.gaz, self.hmm, self.known_words)
        senses = disambiguate(e.words)
        return intent_features(e.words, tags, senses, sentence_tense(e.words)), embedding_tokens(e.words)


def _load_threshold() -> float:
    try:
        return float(json.loads((DATA_DIR / "policy.json").read_text())["threshold"])
    except (OSError, ValueError, KeyError):
        return DEFAULT_THRESHOLD


_LOCK = threading.Lock()


@lru_cache(maxsize=1)
def _build() -> Models:
    return Models()


def get_models() -> Models:
    """Train once per process (thread-safe), then serve from the cache."""
    with _LOCK:
        return _build()


get_models.cache_clear = _build.cache_clear  # type: ignore[attr-defined]


def preload_in_background() -> None:
    """Start training in a daemon thread so the first request does not pay for it."""
    threading.Thread(target=get_models, name="nlp-preload", daemon=True).start()


# =========================================================================== analysis
def analyse(text: str, models: Models, gaz: Gazetteer, today: date, spell: bool = True) -> dict:
    """Everything except discourse for one utterance."""
    clean, toks, rewrites = front_end(text, models.english_vocab)
    words = [t.norm for t in toks]
    corrections: list[dict] = []
    if spell:
        extra = {w for n in gaz.dishes + gaz.ingredients for w in n.lower().split()}
        skip = {i for i, t in enumerate(toks) if t.kind == "NUM" or words[i] in extra}
        new, fixes = models.speller.correct(words, skip)
        for f in fixes:
            t = toks[f["index"]]
            t.norm = f["to"]
            corrections.append({"from": t.text, "to": f["to"], "start": t.start, "end": t.end,
                                "candidates": f["candidates"]})
        words = new
    tense = sentence_tense(words)
    tags = hybrid_tags(words, gaz, models.hmm, models.known_words)
    entities = []
    for s, e, typ in spans_from_tags(tags):
        span_words = words[s:e]
        ent = {"type": ENTITY_TYPE[typ], "text": text[toks[s].start:toks[e - 1].end] if toks else "",
               "value": None, "start": toks[s].start, "end": toks[e - 1].end}
        if typ in ("DISH", "ING"):
            canon, score = gaz.resolve(span_words, typ, models.embeddings.similarity)
            ent["value"], ent["score"] = canon, score
        elif typ == "QTY":
            ent["value"] = interpret_qty(span_words)[0]
        elif typ == "UNIT":
            ent["value"] = UNITS.get(span_words[0])
        elif typ == "DATE":
            ent["value"] = interpret_date(span_words, today, tense)
        entities.append(ent)
    senses = disambiguate(words)
    feats = intent_features(words, tags, senses, tense)
    emb_toks = embedding_tokens(words)
    scores = models.intent.proba(feats, emb_toks)
    intent = max(scores, key=scores.get)
    has_deva = any(t.kind == "DEVA" for t in toks)
    lang, lang_dbg = sentence_language(models.langid, words, models.neutral, has_deva)
    return {"text": text, "clean": clean, "words": words, "tags": tags, "tense": tense, "entities": entities,
            "senses": senses, "features": feats, "intentScores": scores, "intent": intent,
            "confidence": scores[intent], "lang": lang, "langDebug": lang_dbg, "rewrites": rewrites,
            "corrections": corrections}


def parse(text: str, history: list[dict] | None = None, dishes: list[str] | None = None,
          ingredients: list[str] | None = None, today: date | None = None) -> dict:
    t0 = time.perf_counter()
    models = get_models()
    gaz = Gazetteer(dishes, ingredients) if (dishes or ingredients) else models.gaz
    today = today or date.today()

    # previous user turns (last 3), each resolved against the ones before it
    past: list[dict] = []
    for h in [h for h in (history or []) if h.get("role") == "user" and h.get("text")][-3:]:
        a = analyse(h["text"], models, gaz, today)
        a["resolved"] = coref.resolve(a, past)
        past.append(a)

    cur = analyse(text, models, gaz, today)
    res = coref.resolve(cur, past)
    ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "intent": res["intent"],
        "confidence": round(res["confidence"], 4),
        "intentScores": {k: round(v, 4) for k, v in sorted(cur["intentScores"].items(), key=lambda kv: -kv[1])},
        "entities": cur["entities"],
        "resolved": {
            "intent": res["intent"],
            "dish": _slot(res, "DISH"),
            "ingredient": _slot(res, "INGREDIENT"),
            "date": _slot(res, "DATE"),
            "qty": _slot(res, "QTY"),
            "unit": _slot(res, "UNIT"),
            "ellipsis": res["ellipsis"],
            "inheritedIntent": res["inheritedIntent"],
            "antecedents": res["antecedents"],
        },
        "language": cur["lang"],
        "normalizedText": " ".join(cur["words"]),
        "corrections": cur["corrections"],
        "debug": {
            "classifier": models.intent.name,
            "classifierIntent": cur["intent"],
            "threshold": models.threshold,
            "tokens": cur["words"],
            "tags": cur["tags"],
            "tense": cur["tense"],
            "senses": [{k: s[k] for k in ("word", "sense", "overlap")} for s in cur["senses"]],
            "features": cur["features"],
            "language": cur["langDebug"],
            "rewrites": cur["rewrites"],
            "latencyMs": ms,
        },
    }


def _slot(res: dict, typ: str):
    e = res["slots"].get(typ)
    if not e:
        return None
    return {"text": e["text"], "value": e["value"]}
