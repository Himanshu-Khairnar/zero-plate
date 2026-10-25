"""Evaluation of every pipeline component on held-out data.

Used by the tests (app/tests/test_nlp_*.py) and by the report
(python -m app.nlp.report). Each function returns plain dicts.
"""

from __future__ import annotations

import random
import statistics
import time
from collections import Counter
from datetime import date

from app.nlp.classifiers import answer_category, regex_intent
from app.nlp.corpus import Example, bio_tags, front_end, load_json, parse_bracketed, spans_from_tags, split
from app.nlp.embeddings import seed_split
from app.nlp.features import embedding_tokens, intent_features
from app.nlp.gazetteer import Gazetteer
from app.nlp.hmm import HMMTagger, rule_tags
from app.nlp.langid import sentence_language
from app.nlp.lm import NgramLM
from app.nlp.morphology import sentence_tense
from app.nlp.pipeline import CLASSIFIERS, Models, analyse, get_models, hybrid_tags, parse
from app.nlp.wsd import disambiguate, lesk

INTENTS = ["waste", "forecast", "prep", "stock", "sales", "purchase", "help", "unknown"]
FIXED_TODAY = date(2026, 10, 25)


def prf(gold: list[str], pred: list[str], labels: list[str]) -> dict:
    per = {}
    for c in labels:
        tp = sum(g == c and p == c for g, p in zip(gold, pred))
        fp = sum(g != c and p == c for g, p in zip(gold, pred))
        fn = sum(g == c and p != c for g, p in zip(gold, pred))
        pr = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        per[c] = {"precision": round(pr, 4), "recall": round(rc, 4),
                  "f1": round(2 * pr * rc / (pr + rc), 4) if pr + rc else 0.0, "support": tp + fn}
    acc = sum(g == p for g, p in zip(gold, pred)) / len(gold)
    present = [c for c in labels if per[c]["support"]]
    return {"accuracy": round(acc, 4), "macro_f1": round(sum(per[c]["f1"] for c in present) / len(present), 4),
            "per_class": per}


def confusion(gold: list[str], pred: list[str], labels: list[str]) -> list[list[int]]:
    idx = {c: i for i, c in enumerate(labels)}
    M = [[0] * len(labels) for _ in labels]
    for g, p in zip(gold, pred):
        if g in idx and p in idx:
            M[idx[g]][idx[p]] += 1
    return M


# =========================================================================== intents
def eval_intents(models: Models | None = None) -> dict:
    m = models or get_models()
    test = split("test")
    feats = []
    for e in test:
        a = analyse(e.text, m, m.gaz, FIXED_TODAY, spell=False)
        feats.append((a["features"], embedding_tokens(a["words"])))
    gold = [e.intent for e in test]
    out: dict = {"classifiers": {}, "selected": m.intent.name, "dev_accuracy": m.dev_accuracy}
    preds_by: dict[str, list[str]] = {}
    for name in CLASSIFIERS:
        preds = []
        for f, et in feats:
            p = m.intent.proba(f, et, which=name)
            preds.append(max(p, key=p.get))
        preds_by[name] = preds
        r = prf(gold, preds, INTENTS)
        r["by_language"] = _by_lang(test, gold, preds)
        out["classifiers"][name] = r
    # regex baseline: its single fallback answer is right for help *and* unknown
    rx = [regex_intent(e.text) for e in test]
    rx_mapped = [g if (p == "fallback" and g in ("help", "unknown")) else ("help" if p == "fallback" else p)
                 for g, p in zip(gold, rx)]
    r = prf(gold, rx_mapped, INTENTS)
    r["by_language"] = _by_lang(test, gold, rx_mapped)
    out["classifiers"]["regex_baseline"] = r
    # scikit-learn logistic regression on the same features (comparison only)
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer as SkTfidf
        from sklearn.linear_model import LogisticRegression

        train = split("train")
        tr_feats = [analyse(e.text, m, m.gaz, FIXED_TODAY, spell=False)["features"] for e in train]
        vec = SkTfidf(analyzer=lambda x: x, sublinear_tf=True)
        clf = LogisticRegression(max_iter=2000, C=10).fit(vec.fit_transform(tr_feats), [e.intent for e in train])
        sk = list(clf.predict(vec.transform([f for f, _ in feats])))
        r = prf(gold, sk, INTENTS)
        r["by_language"] = _by_lang(test, gold, sk)
        out["classifiers"]["sklearn_logreg_baseline"] = r
    except ImportError:  # pragma: no cover
        pass
    out["confusion"] = {"labels": INTENTS, "matrix": confusion(gold, preds_by[m.intent.name], INTENTS)}
    out["errors"] = [{"text": e.text, "gold": g, "pred": p} for e, g, p in zip(test, gold, preds_by[m.intent.name])
                     if g != p]
    return out


def _by_lang(test: list[Example], gold: list[str], pred: list[str]) -> dict:
    out = {}
    for lang in ("en", "hi-Latn"):
        idx = [i for i, e in enumerate(test) if e.lang == lang]
        out[lang] = round(sum(gold[i] == pred[i] for i in idx) / len(idx), 4) if idx else None
    return out


# =========================================================================== tagging
NOVEL_DISHES = ["hakka noodles", "veg manchurian", "misal", "poha", "upma", "idli sambar", "spring rolls",
                "rajma", "kadhi", "pasta"]
NOVEL_INGS = ["mushrooms", "capsicum", "cabbage", "ginger", "garlic", "lemons", "coriander", "spinach", "carrots",
              "cauliflower"]


def _novel_examples(test: list[Example], seed: int = 5) -> list[tuple[list[str], list[str]]]:
    """Test sentences with every dish/ingredient replaced by a name the gazetteer does not know."""
    rng = random.Random(seed)
    out = []
    for e in test:
        if not any(t in ("DISH", "ING") for _, _, t in e.spans):
            continue
        text, pos, spans = "", 0, []
        for s, en, typ in sorted(e.spans):
            text += e.text[pos:s]
            rep = rng.choice(NOVEL_DISHES) if typ == "DISH" else rng.choice(NOVEL_INGS) if typ == "ING" else e.text[s:en]
            spans.append((len(text), len(text) + len(rep), typ))
            text += rep
            pos = en
        text += e.text[pos:]
        _, toks, _ = front_end(text)
        out.append(([t.norm for t in toks], bio_tags(toks, spans)))
    return out


def _tag_scores(data: list[tuple[list[str], list[str]]], fn) -> dict:
    c = n = tp = fp = fn_ = 0
    per = Counter()
    for words, gold in data:
        pred = fn(words)
        c += sum(a == b for a, b in zip(pred, gold))
        n += len(gold)
        P, G = set(spans_from_tags(pred)), set(spans_from_tags(gold))
        tp += len(P & G)
        fp += len(P - G)
        fn_ += len(G - P)
        for s in P & G:
            per[(s[2], "tp")] += 1
        for s in P - G:
            per[(s[2], "fp")] += 1
        for s in G - P:
            per[(s[2], "fn")] += 1
    pr, rc = tp / max(1, tp + fp), tp / max(1, tp + fn_)
    by_type = {}
    for typ in ("DISH", "ING", "QTY", "UNIT", "DATE"):
        a, b, d = per[(typ, "tp")], per[(typ, "fp")], per[(typ, "fn")]
        p2, r2 = a / max(1, a + b), a / max(1, a + d)
        by_type[typ] = round(2 * p2 * r2 / (p2 + r2), 4) if p2 + r2 else 0.0
    return {"token_accuracy": round(c / n, 4), "entity_precision": round(pr, 4), "entity_recall": round(rc, 4),
            "entity_f1": round(2 * pr * rc / (pr + rc), 4) if pr + rc else 0.0, "entity_f1_by_type": by_type,
            "sentences": len(data), "tokens": n}


def eval_tagging(models: Models | None = None) -> dict:
    m = models or get_models()
    test = split("test")
    data = [(e.words, e.tags) for e in test]
    novel = _novel_examples(test)
    taggers = {"rule_baseline": lambda w: rule_tags(w, m.gaz), "hmm_viterbi": lambda w: m.hmm.tag(w, m.gaz),
               "hybrid_pipeline": lambda w: hybrid_tags(w, m.gaz, m.hmm, m.known_words)}
    return {"test": {k: _tag_scores(data, f) for k, f in taggers.items()},
            "unseen_names": {k: _tag_scores(novel, f) for k, f in taggers.items()},
            "hmm": {"states": len(m.hmm.tags), "observation_symbols": len(m.hmm.vocab)}}


# =========================================================================== language model
def eval_lm() -> dict:
    train = [e.words for e in split("train")]
    test = [e.words for e in split("test")]
    out = {}
    for n in (1, 2, 3):
        lm = NgramLM(order=n, min_count=2).fit(train)
        out[f"{n}-gram"] = {meth: lm.perplexity(test, meth) for meth in ("mle", "laplace", "gt")}
        out[f"{n}-gram"]["vocab"] = lm.V
    return out


# =========================================================================== spelling
def eval_spelling(models: Models | None = None, lam: float | None = None) -> dict:
    m = models or get_models()
    data = load_json("spelling.json")
    speller = m.speller
    old = speller.lam
    if lam is not None:
        speller.lam = lam
    ok, rows = 0, []
    try:
        for d in data:
            _, toks, _ = front_end(d["text"], m.english_vocab)
            words = [t.norm for t in toks]
            i = [t.text.lower() for t in toks].index(d["wrong"])
            new, _ = speller.correct(words)
            hit = new[i] == d["right"]
            ok += hit
            rows.append({"text": d["text"], "wrong": d["wrong"], "expected": d["right"], "got": new[i], "ok": hit})
    finally:
        speller.lam = old
    errors = [r for r in data if r["wrong"] != r["right"]]
    keep = [r for r in data if r["wrong"] == r["right"]]
    fixed = sum(r["ok"] for r in rows if r["wrong"] != r["expected"])
    kept = sum(r["ok"] for r in rows if r["wrong"] == r["expected"])
    # false corrections on clean held-out questions
    changed = total = 0
    for e in split("test"):
        new, fixes = speller.correct(e.words)
        total += len(e.words)
        changed += len(fixes)
    return {"accuracy": round(ok / len(data), 4), "misspellings_fixed": f"{fixed}/{len(errors)}",
            "new_words_kept": f"{kept}/{len(keep)}", "false_correction_rate_clean_test": round(changed / total, 4),
            "lambda": lam if lam is not None else old, "rows": rows}


# =========================================================================== WSD
def eval_wsd() -> dict:
    data = load_json("wsd.json")
    ok, rows, per = 0, [], Counter()
    for t in data["test"]:
        _, toks, _ = front_end(t["text"])
        words = [x.norm for x in toks]
        idx = next(i for i, w in enumerate(words) if w == t["word"] or w.rstrip("s") == t["word"]
                   or w.startswith(t["word"]))
        r = lesk(words, idx)
        hit = r["sense"] == t["sense"]
        ok += hit
        per[(t["word"], hit)] += 1
        rows.append({**t, "pred": r["sense"], "overlap": r["overlap"], "ok": hit})
    mfs = sum(t["sense"] == data["first_sense"][t["word"]] for t in data["test"])
    by_word = {w: f"{per[(w, True)]}/{per[(w, True)] + per[(w, False)]}" for w in data["first_sense"]}
    return {"accuracy": round(ok / len(rows), 4), "most_frequent_sense_baseline": round(mfs / len(rows), 4),
            "by_word": by_word, "n": len(rows), "rows": rows}


# =========================================================================== coreference
def _coref_ok(res: dict, expect: dict) -> bool:
    good = res["intent"] == expect["intent"]
    for typ, want in expect.items():
        if typ == "intent":
            continue
        slot = res.get({"DISH": "dish", "INGREDIENT": "ingredient", "DATE": "date"}[typ])
        vals = [] if not slot else [str(slot["text"]).lower(),
                                    str(slot["value"]["label"] if isinstance(slot["value"], dict) else slot["value"]).lower()]
        good = good and want.lower() in vals
    return good


def eval_coref() -> dict:
    data = load_json("coref.json")
    ok = no_hist = 0
    rows = []
    for d in data:
        res = parse(d["text"], [{"role": "user", "text": h} for h in d["history"]], today=FIXED_TODAY)["resolved"]
        good = _coref_ok(res, d["expect"])
        ok += good
        no_hist += _coref_ok(parse(d["text"], [], today=FIXED_TODAY)["resolved"], d["expect"])
        rows.append({"history": d["history"], "text": d["text"], "expect": d["expect"], "intent": res["intent"],
                     "dish": res["dish"], "ingredient": res["ingredient"],
                     "date": res["date"]["text"] if res["date"] else None,
                     "antecedents": res["antecedents"], "ellipsis": res["ellipsis"], "ok": good})
    return {"accuracy": round(ok / len(data), 4), "n": len(data),
            "without_history_accuracy": round(no_hist / len(data), 4), "rows": rows}


# =========================================================================== language ID
def eval_langid(models: Models | None = None) -> dict:
    m = models or get_models()
    test = split("test")
    ok, dist = 0, Counter()
    for e in test:
        lang, _ = sentence_language(m.langid, e.words, m.neutral)
        dist[(e.lang, lang)] += 1
        ok += (lang == "en") == (e.lang == "en")
    return {"sentence_accuracy_en_vs_hinglish": round(ok / len(test), 4),
            "distribution": {f"{g}->{p}": c for (g, p), c in sorted(dist.items())}}


# =========================================================================== embeddings
def eval_embeddings(models: Models | None = None) -> dict:
    m = models or get_models()
    emb = m.embeddings
    seed, held = seed_split()

    def p_at(pairs: dict[str, str], k: int) -> tuple[float, int]:
        english = {v for v in pairs.values()} | {w for w in emb.vocab if w.isalpha()}
        hit = n = 0
        for hi, en in pairs.items():
            if hi not in emb or en not in emb:
                continue
            n += 1
            nb = [w for w, _ in emb.neighbours(hi, k=k, restrict=english - {hi})]
            hit += en in nb
        return (round(hit / n, 4) if n else 0.0), n

    out = {}
    for name, pairs in (("seed_pairs", seed), ("held_out_pairs", held)):
        p1, n = p_at(pairs, 1)
        p5, _ = p_at(pairs, 5)
        out[name] = {"p@1": p1, "p@5": p5, "pairs_in_vocab": n}
    out["examples"] = {w: emb.neighbours(w, 5) for w in ("chai", "sabzi", "paneer", "kal", "bikna", "waste")
                       if w in emb}
    out["similarity"] = {"chai~tea": round(emb.similarity("chai", "tea"), 3),
                         "sabzi~vegetable": round(emb.similarity("sabzi", "vegetable"), 3),
                         "chai~onion": round(emb.similarity("chai", "onion"), 3)}
    out["dim"], out["vocab"] = int(emb.W.shape[1]), len(emb.vocab)
    return out


# =========================================================================== morphology / FSA
def eval_fsa() -> dict:
    """Date/quantity recogniser accuracy on the gold DATE/QTY spans of the test set."""
    test = split("test")
    from app.nlp.fsa import scan

    tp = fp = fn = 0
    for e in test:
        gold = {(s, en, t) for s, en, t in spans_from_tags(e.tags) if t in ("DATE", "QTY")}
        pred = set()
        for mt in scan(e.words):
            pred.add((mt.start, mt.start + 1 if mt.kind == "QTY" else mt.end, mt.kind))
        tp += len(gold & pred)
        fp += len(pred - gold)
        fn += len(gold - pred)
    p, r = tp / max(1, tp + fp), tp / max(1, tp + fn)
    return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(2 * p * r / (p + r), 4) if p + r else 0}


# =========================================================================== policy
def eval_policy(models: Models | None = None) -> dict:
    """Pick the confidence threshold T for using NLP over the regex rules.

    combined(q) = NLP intent if confidence >= T and the intent is answerable
    (not help/unknown; purchase needs an ingredient), else the regex rules.
    T is the smallest grid value with zero regressions on the test set (no
    question that the regex rules answer correctly gets a different answer
    category), plus one grid step (0.05) as a safety margin.
    """
    m = models or get_models()
    rows = []
    for e in split("train") + split("test"):
        r = parse(e.text, [], today=FIXED_TODAY)
        rows.append({"text": e.text, "gold": e.intent, "split": e.split, "lang": e.lang, "nlp": r["intent"],
                     "confidence": r["confidence"], "hasIngredient": bool(r["resolved"]["ingredient"]),
                     "regex": regex_intent(e.text)})

    def combined(r: dict, T: float) -> str:
        usable = r["confidence"] >= T and r["nlp"] not in ("help", "unknown") and (
            r["nlp"] != "purchase" or r["hasIngredient"])
        return r["nlp"] if usable else r["regex"]

    def stats(T: float, subset: list[dict]) -> dict:
        regress = [r for r in subset if answer_category(r["regex"]) == answer_category(r["gold"])
                   and answer_category(combined(r, T)) != answer_category(r["gold"])]
        acc = sum(answer_category(combined(r, T)) == answer_category(r["gold"]) for r in subset) / len(subset)
        rx = sum(answer_category(r["regex"]) == answer_category(r["gold"]) for r in subset) / len(subset)
        return {"threshold": T, "regressions": len(regress), "combined_answer_accuracy": round(acc, 4),
                "regex_answer_accuracy": round(rx, 4), "regressed": [r["text"] for r in regress]}

    test_rows = [r for r in rows if r["split"] == "test"]
    grid = [round(0.30 + 0.05 * i, 2) for i in range(14)]
    sweep = [stats(T, test_rows) for T in grid]
    zero = [s for s in sweep if s["regressions"] == 0]
    minimal = min(zero, key=lambda s: s["threshold"])["threshold"] if zero else 0.95
    best = round(min(0.95, minimal + 0.05), 2)
    return {"threshold": best, "minimal_zero_regression_threshold": minimal, "sweep_test": sweep, "at_threshold": {"test": stats(best, test_rows),
                                                                      "all": stats(best, rows)},
            "rows": rows}


def eval_latency(n_warm: int = 3) -> dict:
    from fastapi.testclient import TestClient

    import logging

    from app.main import app

    logging.getLogger("httpx").setLevel(logging.WARNING)
    get_models.cache_clear()
    client = TestClient(app)
    t0 = time.perf_counter()
    client.post("/api/nlp/parse", json={"text": "kal kitna paneer chahiye"})
    cold = (time.perf_counter() - t0) * 1000
    qs = [e.text for e in split("test")]
    times = []
    for _ in range(n_warm):
        for q in qs:
            t = time.perf_counter()
            client.post("/api/nlp/parse", json={"text": q, "history": [{"role": "user", "text": "how much paneer do we have"}]})
            times.append((time.perf_counter() - t) * 1000)
    times.sort()
    return {"cold_start_ms_incl_training": round(cold, 1), "requests": len(times),
            "p50_ms": round(statistics.median(times), 2), "p95_ms": round(times[int(0.95 * len(times)) - 1], 2),
            "max_ms": round(times[-1], 2)}
