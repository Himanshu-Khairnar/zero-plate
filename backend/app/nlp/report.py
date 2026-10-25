"""Regenerate the NLP evaluation report.

    cd backend && python -m app.nlp.report            # everything (runs pytest too)
    cd backend && python -m app.nlp.report --no-tests

Writes
    docs/nlp/results.json, docs/nlp/results.md, docs/nlp/figures/*.png
    backend/app/nlp/data/policy.json                  (tuned confidence threshold)
    frontend/src/lib/assistant/__fixtures__/nlp-regression.json   (vitest regression set)

matplotlib is needed only here (not by the service): pip install matplotlib
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from app.nlp import evaluate as E
from app.nlp.corpus import DATA_DIR, load_dataset
from app.nlp.pipeline import get_models, parse

BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
DOCS = ROOT / "docs" / "nlp"
FIG = DOCS / "figures"
FIXTURE = ROOT / "frontend" / "src" / "lib" / "assistant" / "__fixtures__" / "nlp-regression.json"

# Reference categorical palette (fixed order), text inks and a single-hue ramp.
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"


def _plt():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "axes.edgecolor": GRID,
                         "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2, "text.color": INK,
                         "axes.spines.top": False, "axes.spines.right": False, "font.size": 10,
                         "axes.titleweight": "bold", "axes.titlesize": 12})
    return plt


# =========================================================================== figures
def fig_confusion(intents: dict) -> None:
    plt = _plt()
    labels, M = intents["confusion"]["labels"], np.array(intents["confusion"]["matrix"])
    fig, ax = plt.subplots(figsize=(6.4, 5.4))
    ax.imshow(M, cmap="Blues")
    ax.set_xticks(range(len(labels)), labels, rotation=40, ha="right")
    ax.set_yticks(range(len(labels)), labels)
    ax.set_xlabel("predicted")
    ax.set_ylabel("gold")
    for i in range(len(labels)):
        for j in range(len(labels)):
            if M[i, j]:
                ax.text(j, i, int(M[i, j]), ha="center", va="center", fontsize=9,
                        color="white" if M[i, j] > M.max() * 0.5 else INK)
    ax.set_title(f"Intent confusion matrix - {intents['selected']} (test set)")
    fig.tight_layout()
    fig.savefig(FIG / "confusion_matrix.png", dpi=150)
    plt.close(fig)


def fig_per_intent_f1(intents: dict) -> None:
    plt = _plt()
    names = ["maxent", "naive_bayes", "tfidf_centroid", "regex_baseline"]
    labels = E.INTENTS
    fig, ax = plt.subplots(figsize=(9, 4.2))
    w = 0.2
    for k, n in enumerate(names):
        vals = [intents["classifiers"][n]["per_class"][c]["f1"] for c in labels]
        ax.bar(np.arange(len(labels)) + (k - 1.5) * w, vals, w * 0.9, label=n.replace("_", " "), color=SERIES[k])
    ax.set_xticks(range(len(labels)), labels)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("F1 (test)")
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    ax.legend(ncols=4, frameon=False, loc="upper center", bbox_to_anchor=(0.5, 1.13))
    ax.set_title("Per-intent F1 on the held-out test set", pad=28)
    fig.tight_layout()
    fig.savefig(FIG / "per_intent_f1.png", dpi=150)
    plt.close(fig)


def fig_perplexity(lm: dict) -> None:
    plt = _plt()
    orders = ["1-gram", "2-gram", "3-gram"]
    methods = [("mle", "unsmoothed (MLE)"), ("laplace", "Laplace add-one"), ("gt", "Good-Turing + Katz back-off")]
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    w = 0.26
    finite = [lm[o][m]["perplexity"] for o in orders for m, _ in methods if math.isfinite(lm[o][m]["perplexity"])]
    top = max(finite) * 1.2
    for k, (m, label) in enumerate(methods):
        xs = np.arange(len(orders)) + (k - 1) * w
        for x, o in zip(xs, orders):
            pp = lm[o][m]["perplexity"]
            if math.isfinite(pp):
                ax.bar(x, pp, w * 0.9, color=SERIES[k], label=label if o == orders[0] or m == "mle" else None)
                ax.text(x, pp + top * 0.01, f"{pp:.0f}", ha="center", va="bottom", fontsize=8, color=INK2)
            else:
                ax.bar(x, top * 0.97, w * 0.9, color="none", edgecolor=SERIES[k], hatch="//", lw=1)
                ax.text(x, top * 0.5, "inf", ha="center", va="center", fontsize=9, color=INK2, rotation=90)
    handles, labels = ax.get_legend_handles_labels()
    seen = dict(zip(labels, handles))
    ax.legend(seen.values(), seen.keys(), frameon=False, loc="upper center", ncols=3, bbox_to_anchor=(0.5, 1.12))
    ax.set_xticks(range(len(orders)), orders)
    ax.set_ylim(0, top)
    ax.set_ylabel("perplexity on held-out questions")
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    ax.set_title("Language-model perplexity (lower is better; hatched = infinite)", pad=30)
    fig.tight_layout()
    fig.savefig(FIG / "perplexity.png", dpi=150)
    plt.close(fig)


def fig_word_map() -> None:
    plt = _plt()
    from app.nlp.lexicon import EN_STOP, HI_EN, HI_STOP

    emb = get_models().embeddings
    pairs = [(h, e) for h, e in HI_EN.items() if h in emb and e in emb and h != e and "_" not in e
             and e not in EN_STOP and h not in HI_STOP][:20]
    words = sorted({w for p in pairs for w in p})
    X = np.vstack([emb.vec(w) for w in words]).astype(float)
    X -= X.mean(0)
    U, S, Vt = np.linalg.svd(X, full_matrices=False)
    P = X @ Vt[:2].T
    pos = {w: P[i] for i, w in enumerate(words)}
    hi = {h for h, _ in pairs}
    fig, ax = plt.subplots(figsize=(8, 6.2))
    for h, e in pairs:
        ax.plot([pos[h][0], pos[e][0]], [pos[h][1], pos[e][1]], color=GRID, lw=1, zorder=1)
    for w in words:
        c = SERIES[1] if w in hi else SERIES[0]
        ax.scatter(*pos[w], s=36, color=c, edgecolor=SURFACE, lw=1.5, zorder=2)
        ax.annotate(w, pos[w], xytext=(4, 3), textcoords="offset points", fontsize=8, color=INK)
    ax.scatter([], [], color=SERIES[0], label="English")
    ax.scatter([], [], color=SERIES[1], label="Hinglish")
    ax.legend(frameon=False, loc="best")
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_title("PPMI + SVD word vectors, 2-D projection (lines join translation pairs)")
    fig.tight_layout()
    fig.savefig(FIG / "ppmi_svd_word_map.png", dpi=150)
    plt.close(fig)


def fig_trellis(sentence: str = "kal kitna paneer chahiye") -> None:
    plt = _plt()
    m = get_models()
    words = sentence.split()
    v = m.hmm.viterbi(words, m.gaz)
    D = v["delta"].T.copy()
    D[D < -200] = np.nan
    tags = m.hmm.tags
    fig, ax = plt.subplots(figsize=(7, 5.6))
    ax.imshow(D, cmap="Blues", aspect="auto")
    ax.set_xticks(range(len(words)), [f"{w}\n({o})" if o != w else w for w, o in zip(words, v["obs"])])
    ax.set_yticks(range(len(tags)), tags)
    path = [tags.index(t) for t in v["tags"]]
    ax.plot(range(len(words)), path, color=SERIES[1], lw=2, marker="o", ms=8)
    for i in range(len(words)):
        for j in range(len(tags)):
            if np.isfinite(D[j, i]):
                ax.text(i, j, f"{D[j, i]:.1f}", ha="center", va="center", fontsize=7, color=INK2)
    ax.set_title(f'Viterbi trellis log delta_t(tag) for "{sentence}"\n(orange = best path: {" ".join(v["tags"])})',
                 fontsize=10)
    fig.tight_layout()
    fig.savefig(FIG / "viterbi_trellis.png", dpi=150)
    plt.close(fig)


def fig_pipeline() -> None:
    plt = _plt()
    from matplotlib.patches import FancyBboxPatch

    steps = [("Regex normalise + tokenize", "EN / Hinglish / Devanagari (U1)"),
             ("Hinglish respelling", "phonetic-key rules (U1)"),
             ("Spelling correction", "edit distance + bigram LM (U2)"),
             ("Morphology / tense", "Porter + Hindi suffixes (U2)"),
             ("DFA dates & quantities", "finite-state recogniser (U1/2)"),
             ("Slot tagging", "gazetteer + HMM Viterbi (U3)"),
             ("Name lookup", "trigram Dice + PPMI-SVD (U5)"),
             ("Word-sense disambiguation", "simplified Lesk (U4)"),
             ("Intent classification", "MaxEnt / NB / TF-IDF (U4/5)"),
             ("Language ID", "char n-gram NB (U1)"),
             ("Discourse", "anaphora + ellipsis (U6)")]
    fig, ax = plt.subplots(figsize=(7.2, 9.5))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, len(steps) * 1.1 + 1.2)
    ax.axis("off")
    y = len(steps) * 1.1 + 0.6
    ax.text(5, y, "question + history + outlet menu", ha="center", va="center", color=INK2, fontsize=10)
    for i, (a, b) in enumerate(steps):
        yy = y - 1.1 * (i + 1)
        ax.add_patch(FancyBboxPatch((1.2, yy - 0.38), 7.6, 0.76, boxstyle="round,pad=0.02,rounding_size=0.15",
                                    fc="white", ec=SERIES[0], lw=1.2))
        ax.text(5, yy + 0.12, a, ha="center", va="center", fontsize=10, color=INK, weight="bold")
        ax.text(5, yy - 0.18, b, ha="center", va="center", fontsize=8, color=INK2)
        ax.annotate("", xy=(5, yy + 0.4), xytext=(5, yy + 0.7), arrowprops=dict(arrowstyle="->", color=INK2))
    ax.text(5, y - 1.1 * (len(steps) + 1) + 0.55, "{intent, confidence, entities, resolved} -> offline assistant",
            ha="center", va="center", color=INK2, fontsize=10)
    ax.set_title("POST /api/nlp/parse pipeline")
    fig.tight_layout()
    fig.savefig(FIG / "pipeline.png", dpi=150)
    plt.close(fig)


def fig_threshold(policy: dict) -> None:
    plt = _plt()
    s = policy["sweep_test"]
    T = [x["threshold"] for x in s]
    fig, ax = plt.subplots(figsize=(7, 3.8))
    ax.plot(T, [x["combined_answer_accuracy"] for x in s], color=SERIES[0], lw=2, marker="o", ms=5,
            label="NLP above threshold, rules below")
    ax.plot(T, [x["regex_answer_accuracy"] for x in s], color=SERIES[1], lw=2, ls="--", label="regex rules only")
    for x in s:
        if x["regressions"]:
            ax.annotate(f'{x["regressions"]} regression', (x["threshold"], x["combined_answer_accuracy"]),
                        xytext=(6, -14), textcoords="offset points", fontsize=8, color=INK2)
    ax.axvline(policy["threshold"], color=INK2, lw=1, ls=":")
    ax.text(policy["threshold"], 0.52, f' chosen T = {policy["threshold"]}', fontsize=8, color=INK2)
    ax.set_xlabel("confidence threshold T")
    ax.set_ylabel("answer accuracy (test)")
    ax.set_ylim(0.5, 1.0)
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.legend(frameon=False, loc="upper right")
    ax.set_title("Routing policy: when to trust the NLP parse")
    fig.tight_layout()
    fig.savefig(FIG / "threshold_sweep.png", dpi=150)
    plt.close(fig)


# =========================================================================== transcript
TRANSCRIPT = [
    ("Which dish did we waste most last month?", []),
    ("kal kitna paneer chahiye", []),
    ("aaj kitna waste hua", []),
    ("forcast for tomorrow", []),
    ("how much panner should I order for next friday?", []),
    ("and milk?", ["how much paneer do we have"]),
    ("how much of it should i order for the weekend", ["how much paneer do we have"]),
    ("कल कितनी बिरयानी बिकेगी", []),
    ("pichle hafte ki sales kitni thi", []),
    ("aur parso?", ["kal kitni biryani bikegi"]),
    ("tell me a joke", []),
]


def route(p: dict) -> str:
    """Python mirror of answerFromParse() in frontend/src/lib/assistant/offline.ts (tool call only)."""
    r, intent = p["resolved"], p["intent"]
    th = p["debug"]["threshold"]
    answerable = intent in ("waste", "forecast", "prep", "stock", "sales", "purchase")
    if p["confidence"] < th or not answerable or (intent == "purchase" and not r["ingredient"]):
        return "keyword rules (NLP not used)"
    d = (r["date"] or {}).get("value")
    name = lambda s: (s["value"] or s["text"]) if s else None  # noqa: E731
    if intent in ("waste", "sales"):
        days = (30 if intent == "waste" else 7) if not d or d["direction"] == "future" else max(1, min(90, 1 - d["offset"]))
        return f'{intent}Summary(days={days}' + (f', dish="{name(r["dish"])}")' if r["dish"] else ")")
    if intent == "forecast":
        if d and d["direction"] != "past":
            return f'forecastFor(start={d["start"]}, days={max(1, min(7, d["days"]))}' + (
                f', dish="{name(r["dish"])}")' if r["dish"] else ")")
        return "forecastFor(start=tomorrow, days=1)"
    if intent == "prep":
        return f'prepPlanFor({d["start"] if d and d["offset"] >= 0 else "tomorrow"})'
    if intent == "stock":
        return f'stockLevels("{name(r["ingredient"]) or ""}")'
    days = 2 if not d or d["direction"] == "past" else max(1, min(14, d["offset"] + d["days"] - 1))
    return f'orderSuggestion("{name(r["ingredient"])}", days={days})'


def transcript() -> list[dict]:
    out = []
    for q, hist in TRANSCRIPT:
        p = parse(q, [{"role": "user", "text": h} for h in hist], today=E.FIXED_TODAY)
        out.append({"question": q, "history": hist, "intent": p["intent"], "confidence": p["confidence"],
                    "language": p["language"], "normalized": p["normalizedText"],
                    "corrections": [f'{c["from"]}->{c["to"]}' for c in p["corrections"]],
                    "entities": [f'{e["type"]}:{e["text"]}' + (f'={e["value"]}' if e["type"] in ("DISH", "INGREDIENT") and e["value"] else "")
                                 for e in p["entities"]],
                    "resolved": {k: (v["value"]["label"] if k == "date" and v and isinstance(v["value"], dict) else v["value"] if v else None)
                                 for k, v in p["resolved"].items() if k in ("dish", "ingredient", "date") and v},
                    "antecedents": p["resolved"]["antecedents"], "ellipsis": p["resolved"]["ellipsis"],
                    "tool": route(p)})
    return out


# =========================================================================== tests
def run_tests() -> dict:
    proc = subprocess.run([sys.executable, "-m", "pytest", "-q", "tests"], cwd=BACKEND, capture_output=True,
                          text=True, timeout=1800)
    tail = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else proc.stderr[-300:]
    nums = {k: int(v) for v, k in re.findall(r"(\d+) (passed|failed|skipped|errors?)", tail)}
    nlp = subprocess.run([sys.executable, "-m", "pytest", "-q", *sorted(str(p.relative_to(BACKEND)) for p in
                                                                      (BACKEND / "tests").glob("test_nlp_*.py"))],
                         cwd=BACKEND, capture_output=True, text=True, timeout=1800)
    nlp_tail = nlp.stdout.strip().splitlines()[-1] if nlp.stdout.strip() else ""
    return {"backend_suite": tail, "backend_counts": nums, "nlp_suite": nlp_tail}


# =========================================================================== markdown
def _pct(x: float) -> str:
    return f"{100 * x:.1f}%"


def _pp(x: float) -> str:
    return "inf" if not math.isfinite(x) else f"{x:.1f}"


def write_markdown(R: dict) -> None:
    I, T, L = R["intents"], R["tagging"], R["lm"]
    ds = R["dataset"]
    lines = [
        "# Zero Plate NLP pipeline - evaluation results",
        "",
        "Generated by `cd backend && python -m app.nlp.report`. Every algorithm below is implemented from scratch",
        "in `backend/app/nlp/` (numpy only); scikit-learn appears solely as a comparison baseline.",
        "",
        f"Versions: Python {R['versions']['python']}, numpy {R['versions']['numpy']}, scikit-learn "
        f"{R['versions']['sklearn']}, FastAPI {R['versions']['fastapi']}, matplotlib {R['versions']['matplotlib']}.",
        "",
        "![pipeline](figures/pipeline.png)",
        "",
        "## Dataset",
        "",
        f"`backend/app/nlp/data/intents.jsonl`, built by `python -m app.nlp.data.generate` (seed 13): "
        f"{ds['total']} questions, {ds['by_split']['train']} train / {ds['by_split']['test']} test.",
        "",
        "| split | English | Hinglish | templated | hand-written |",
        "|---|---|---|---|---|",
    ]
    for s in ("train", "test"):
        b = ds["detail"][s]
        lines.append(f"| {s} | {b['en']} | {b['hi-Latn']} | {b['template']} | {b['hand']} |")
    lines += [
        "",
        "Templated questions are split **by template** (a test sentence never shares its frame with a training",
        "sentence) and hand-written ones 70/30 stratified by intent. Intents: " + ", ".join(E.INTENTS) + ".",
        f"Per intent (train/test): " + ", ".join(f"{k} {v[0]}/{v[1]}" for k, v in ds["by_intent"].items()) + ".",
        "",
        "## Intent classification (Units 4-5)",
        "",
        f"The runtime classifier is chosen by accuracy on a 20% dev split of *train* (no test peeking): "
        f"**{I['selected']}** (dev accuracies: " + ", ".join(f"{k} {v:.3f}" for k, v in I["dev_accuracy"].items()) + ").",
        "",
        "| classifier | test accuracy | macro-F1 | English | Hinglish |",
        "|---|---|---|---|---|",
    ]
    for name, r in I["classifiers"].items():
        lines.append(f"| {name.replace('_', ' ')} | {_pct(r['accuracy'])} | {r['macro_f1']:.3f} | "
                     f"{_pct(r['by_language']['en'])} | {_pct(r['by_language']['hi-Latn'])} |")
    lines += [
        "",
        "The regex baseline is the original rule cascade of `offline.ts` (ported to Python); its single help reply is",
        "counted as correct for both `help` and `unknown`. The scikit-learn logistic regression uses exactly the same",
        "features as the from-scratch MaxEnt and is shown only for comparison.",
        "",
        "![confusion](figures/confusion_matrix.png)",
        "",
        "![per-intent F1](figures/per_intent_f1.png)",
        "",
        f"Confusion matrix (rows gold, columns predicted; order {', '.join(I['confusion']['labels'])}):",
        "",
        "```",
        *[" ".join(f"{v:3d}" for v in row) for row in I["confusion"]["matrix"]],
        "```",
        "",
        f"Misclassified test questions ({len(I['errors'])}): " + "; ".join(
            f"\"{e['text']}\" ({e['gold']}->{e['pred']})" for e in I["errors"][:12]) + (" ..." if len(I["errors"]) > 12 else ""),
        "",
        "## Slot tagging (Unit 3)",
        "",
        "HMM with BIO tags (11 states), supervised MLE + add-k smoothing, open-class symbols for unknown words,",
        "Viterbi decoding with BIO constraints. `unseen names` replaces every dish/ingredient in the test sentences",
        "with a name absent from the gazetteer (e.g. *hakka noodles*, *capsicum*).",
        "",
        "| tagger | test token acc. | test entity F1 | unseen-names token acc. | unseen-names entity F1 | unseen DISH F1 | unseen ING F1 |",
        "|---|---|---|---|---|---|---|",
    ]
    for k in ("rule_baseline", "hmm_viterbi", "hybrid_pipeline"):
        a, b = T["test"][k], T["unseen_names"][k]
        lines.append(f"| {k.replace('_', ' ')} | {_pct(a['token_accuracy'])} | {a['entity_f1']:.3f} | "
                     f"{_pct(b['token_accuracy'])} | {b['entity_f1']:.3f} | {b['entity_f1_by_type']['DISH']:.3f} | "
                     f"{b['entity_f1_by_type']['ING']:.3f} |")
    lines += [
        "",
        "On names the gazetteer knows, longest-match rules are near perfect and the HMM alone is weaker; the HMM's",
        "value is context (it finds some names no list contains). The pipeline therefore uses the hybrid: DFA for",
        "dates/quantities, gazetteer for known names, HMM spans only over genuinely unknown words.",
        f"Date/quantity DFA alone on gold DATE/QTY spans: P {R['fsa']['precision']:.3f}, R {R['fsa']['recall']:.3f}, F1 {R['fsa']['f1']:.3f}.",
        "",
        "![trellis](figures/viterbi_trellis.png)",
        "",
        "## Language model (Unit 2)",
        "",
        "Word n-grams over the training questions (words seen once -> `<UNK>`), perplexity on the test questions.",
        "",
        "| model | vocab | unsmoothed | Laplace | Good-Turing (Katz) | zero-probability test tokens (MLE) |",
        "|---|---|---|---|---|---|",
    ]
    for o in ("1-gram", "2-gram", "3-gram"):
        r = L[o]
        lines.append(f"| {o} | {r['vocab']} | {_pp(r['mle']['perplexity'])} | {_pp(r['laplace']['perplexity'])} | "
                     f"{_pp(r['gt']['perplexity'])} | {r['mle']['zero_prob_tokens']}/{r['mle']['tokens']} |")
    S = R["spelling"]
    lines += [
        "",
        "![perplexity](figures/perplexity.png)",
        "",
        "Laplace moves too much mass to unseen n-grams (the trigram is *worse* than the bigram); Good-Turing",
        "discounting with Katz back-off is best, with the bigram slightly ahead of the trigram on this small corpus.",
        "",
        "## Spelling correction (Unit 2)",
        "",
        f"Noisy channel: weighted Damerau-Levenshtein candidates x bigram Katz LM prior. Accuracy "
        f"**{_pct(S['accuracy'])}** on {len(S['rows'])} cases (misspellings fixed {S['misspellings_fixed']}, "
        f"brand/new words left alone {S['new_words_kept']}); false-correction rate on clean test questions "
        f"{_pct(S['false_correction_rate_clean_test'])} of tokens. lambda = {S['lambda']}.",
        "",
        "Failures: " + "; ".join(f"{r['wrong']}->{r['got']} (want {r['expected']})" for r in S["rows"] if not r["ok"]) + ".",
        "",
        "lambda sensitivity (same set, so indicative only): " + ", ".join(
            f"lambda={k}: {_pct(v)}" for k, v in R["spelling_lambda"].items()) + ".",
        "",
        "## Word-sense disambiguation (Unit 4)",
        "",
        f"Simplified Lesk over a hand-written gloss dictionary: **{_pct(R['wsd']['accuracy'])}** on {R['wsd']['n']} "
        f"labelled sentences vs {_pct(R['wsd']['most_frequent_sense_baseline'])} for the most-frequent-sense "
        f"baseline. Per word: " + ", ".join(f"{k} {v}" for k, v in R["wsd"]["by_word"].items()) + ".",
        "",
        "## Embeddings and cross-lingual mapping (Unit 5)",
        "",
        f"PPMI (window 2, context smoothing 0.75) + truncated SVD to {R['embeddings']['dim']} dimensions over "
        f"{R['embeddings']['vocab']} words, code-switching augmentation with half of the bilingual dictionary.",
        "",
        "| translation pairs | P@1 | P@5 | pairs in vocab |",
        "|---|---|---|---|",
        f"| seed (used for augmentation) | {R['embeddings']['seed_pairs']['p@1']:.2f} | {R['embeddings']['seed_pairs']['p@5']:.2f} | {R['embeddings']['seed_pairs']['pairs_in_vocab']} |",
        f"| held out | {R['embeddings']['held_out_pairs']['p@1']:.2f} | {R['embeddings']['held_out_pairs']['p@5']:.2f} | {R['embeddings']['held_out_pairs']['pairs_in_vocab']} |",
        "",
        "Similarities: " + ", ".join(f"{k} {v}" for k, v in R["embeddings"]["similarity"].items()) + ". Nearest "
        "neighbours: " + "; ".join(f"{w}: {', '.join(n for n, _ in nb[:3])}" for w, nb in R["embeddings"]["examples"].items()) + ".",
        "",
        "Honest reading: the augmentation aligns the pairs it was given (chai~tea, sabzi~vegetable), but a few",
        "hundred questions are far too little for held-out translations to emerge distributionally, so the",
        "bilingual dictionary remains the main cross-lingual mechanism and the vectors are a synonym back-off.",
        "",
        "![word map](figures/ppmi_svd_word_map.png)",
        "",
        "## Language ID (Unit 1)",
        "",
        f"Character 1-3-gram Naive Bayes per word, sentence label by Hindi share: English-vs-Hinglish sentence "
        f"accuracy **{_pct(R['langid']['sentence_accuracy_en_vs_hinglish'])}** on the test set "
        f"({', '.join(f'{k} {v}' for k, v in R['langid']['distribution'].items())}).",
        "",
        "## Discourse: anaphora and ellipsis (Unit 6)",
        "",
        f"{R['coref']['n']} hand-written two/three-turn dialogues (`data/coref.json`): **{_pct(R['coref']['accuracy'])}** "
        f"resolved fully (intent + referent); the same follow-ups without history: "
        f"{_pct(R['coref']['without_history_accuracy'])}. The dialogues were written alongside the module, so this "
        "is a functional check rather than an unbiased estimate.",
        "",
        "## Routing policy and safety (offline assistant)",
        "",
    ]
    P = R["policy"]
    a, b = P["at_threshold"]["test"], P["at_threshold"]["all"]
    lines += [
        "`offline.ts` uses the parse only when `confidence >= T`, the intent has a data answer (not help/unknown)",
        "and a purchase question names an ingredient; otherwise the original regex rules answer. T is the smallest",
        f"grid value with **zero regressions** on the test set ({P['minimal_zero_regression_threshold']}) plus one",
        f"0.05 step of margin: **T = {P['threshold']}**.",
        "",
        "| set | answer accuracy, rules only | answer accuracy, combined | regressions |",
        "|---|---|---|---|",
        f"| test | {_pct(a['regex_answer_accuracy'])} | {_pct(a['combined_answer_accuracy'])} | {a['regressions']} |",
        f"| train + test | {_pct(b['regex_answer_accuracy'])} | {_pct(b['combined_answer_accuracy'])} | {b['regressions']} |",
        "",
        "A *regression* is a question the rules answer with the right intent that the combined path answers with a",
        "different one. The same check runs in vitest (`offline.test.ts`) against the real TypeScript rules using the",
        "recorded parses in `frontend/src/lib/assistant/__fixtures__/nlp-regression.json`.",
        "",
        "![threshold](figures/threshold_sweep.png)",
        "",
        "Failure handling on the Next.js side: 1.5 s AbortController timeout; any network error, non-200 or",
        "malformed JSON -> rules, silently; after a failure the parser is skipped for 30 s while a non-awaited",
        "warm-up request wakes the (free-tier, sleeping) service. The Claude path (ANTHROPIC_API_KEY set) is unchanged,",
        "and `/api/assistant` / `/api/mobile/assistant` keep their response shapes.",
        "",
        "## Latency and footprint",
        "",
    ]
    lat = R["latency"]
    lines += [
        f"In-process FastAPI TestClient, {lat['requests']} requests (test questions with one history turn): "
        f"**p50 {lat['p50_ms']} ms, p95 {lat['p95_ms']} ms**, max {lat['max_ms']} ms. First request including lazy "
        f"model training: {lat['cold_start_ms_incl_training']} ms. Training happens once per process; "
        f"models occupy about {R['footprint']['model_mb']} MB of numpy arrays; peak Python allocation while "
        f"training (tracemalloc) {R['footprint']['training_peak_mb']} MB.",
        "",
        "## Sample transcript",
        "",
        "Parsed with `today = 2026-10-25`; *tool* is the data call `offline.ts` makes (answers then come from the",
        "outlet's own data, so no numbers are shown here).",
        "",
        "| # | question (history) | lang | intent (conf.) | slots / fixes | tool call |",
        "|---|---|---|---|---|---|",
    ]
    for i, t in enumerate(R["transcript"], 1):
        h = f" *(after: {' / '.join(t['history'])})*" if t["history"] else ""
        slots = ", ".join(f"{k}={v}" for k, v in t["resolved"].items())
        extra = []
        if t["corrections"]:
            extra.append("fixed " + ", ".join(t["corrections"]))
        if t["antecedents"]:
            extra.append("it -> " + str(t["antecedents"][0]["resolvedTo"]))
        if t["ellipsis"]:
            extra.append("ellipsis")
        lines.append(f"| {i} | {t['question']}{h} | {t['language']} | {t['intent']} ({t['confidence']:.2f}) | "
                     f"{'; '.join([slots] + extra if slots else extra)} | `{t['tool']}` |")
    tr = R.get("tests", {})
    lines += [
        "",
        "## Tests",
        "",
        f"- NLP tests (`backend/tests/test_nlp_*.py`): {tr.get('nlp_suite', 'not run')}",
        f"- Whole backend suite: {tr.get('backend_suite', 'not run')}",
        "- Frontend: `npm run typecheck` and `npm test` (includes `src/lib/assistant/offline.test.ts`).",
        "",
        "## Syllabus map",
        "",
        "| unit | topic | module |",
        "|---|---|---|",
        "| 1 | tokenisation (EN, Hinglish, Devanagari transliteration) | `tokenizer.py` |",
        "| 1 | regex normalisation, Hinglish spelling variants | `normalize.py` |",
        "| 1 | language identification (char n-grams) | `langid.py` |",
        "| 1/2 | finite-state automaton for dates / quantities | `fsa.py` |",
        "| 2 | morphology: Porter stemmer, -age derivation, Hindi inflection, tense | `morphology.py` |",
        "| 2 | n-gram LM, Laplace, Good-Turing + Katz back-off, perplexity | `lm.py` |",
        "| 2 | spelling correction, weighted edit distance, noisy channel | `spell.py` |",
        "| 3 | HMM slot tagging, Viterbi, rule baseline | `hmm.py`, `gazetteer.py` |",
        "| 3/4 | MaxEnt (multinomial logistic regression) | `classifiers.py` |",
        "| 4 | Naive Bayes intent classifier | `classifiers.py` |",
        "| 4 | WSD, simplified Lesk | `wsd.py` |",
        "| 5 | TF-IDF, cosine centroid and k-NN | `classifiers.py` |",
        "| 5 | PPMI + SVD vectors, cross-lingual mapping, fuzzy lookup | `embeddings.py`, `gazetteer.py`, `features.py` |",
        "| 6 | anaphora (Hobbs/centering-inspired), ellipsis | `coref.py` |",
        "",
        "Not implemented: CRF, CYK parsing (optional in the brief).",
        "",
    ]
    (DOCS / "results.md").write_text("\n".join(lines), encoding="utf-8")


# =========================================================================== main
def _clean(o):
    if isinstance(o, float):
        return None if not math.isfinite(o) else round(o, 4)
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, np.generic):
        return _clean(o.item())
    return o


def dataset_stats() -> dict:
    ds = load_dataset()
    detail = {s: Counter() for s in ("train", "test")}
    by_intent: dict[str, list[int]] = {}
    for e in ds:
        detail[e.split][e.lang] += 1
        detail[e.split][e.source] += 1
        by_intent.setdefault(e.intent, [0, 0])[0 if e.split == "train" else 1] += 1
    return {"total": len(ds), "by_split": {s: sum(1 for e in ds if e.split == s) for s in ("train", "test")},
            "by_language": dict(Counter(e.lang for e in ds)), "detail": {k: dict(v) for k, v in detail.items()},
            "by_intent": by_intent}


def footprint() -> dict:
    import tracemalloc

    from app.nlp.pipeline import Models

    tracemalloc.start()
    Models()
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    m = get_models()
    arrays = [m.hmm.log_A, m.hmm.log_B, m.embeddings.W, m.embeddings.ppmi, m.intent.maxent.W, m.intent.knn.X,
              m.intent.centroid.C]
    mb = sum(a.nbytes for a in arrays) / 1e6
    return {"model_mb": round(mb, 1), "training_peak_mb": round(peak / 1e6, 1)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-tests", action="store_true")
    args = ap.parse_args()
    FIG.mkdir(parents=True, exist_ok=True)
    import fastapi
    import matplotlib
    import sklearn

    m = get_models()
    R: dict = {"versions": {"python": platform.python_version(), "numpy": np.__version__, "sklearn": sklearn.__version__,
                            "fastapi": fastapi.__version__, "matplotlib": matplotlib.__version__},
               "dataset": dataset_stats()}
    print("intents ...")
    R["intents"] = E.eval_intents(m)
    print("tagging, lm, spelling, wsd, langid, embeddings ...")
    R["tagging"] = E.eval_tagging(m)
    R["fsa"] = E.eval_fsa()
    R["lm"] = E.eval_lm()
    R["spelling"] = E.eval_spelling(m)
    R["spelling_lambda"] = {lam: E.eval_spelling(m, lam=lam)["accuracy"] for lam in (1.0, 2.0, 3.0, 4.0, 5.0)}
    R["wsd"] = E.eval_wsd()
    R["langid"] = E.eval_langid(m)
    R["embeddings"] = E.eval_embeddings(m)
    print("coreference, policy ...")
    R["coref"] = E.eval_coref()
    policy = E.eval_policy(m)
    R["policy"] = {k: v for k, v in policy.items() if k != "rows"}
    (DATA_DIR / "policy.json").write_text(json.dumps({"threshold": policy["threshold"]}, indent=2) + "\n")
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps({
        "threshold": policy["threshold"],
        "note": "Generated by `python -m app.nlp.report` from backend/app/nlp/data/intents.jsonl.",
        "rows": [{"q": r["text"], "gold": r["gold"], "nlpIntent": r["nlp"], "confidence": round(r["confidence"], 4),
                  "hasIngredient": r["hasIngredient"], "pyRegex": r["regex"]} for r in policy["rows"]],
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    get_models.cache_clear()  # pick up the new threshold
    print("transcript, footprint, latency ...")
    R["transcript"] = transcript()
    R["footprint"] = footprint()
    R["latency"] = E.eval_latency()
    print("figures ...")
    fig_pipeline()
    fig_confusion(R["intents"])
    fig_per_intent_f1(R["intents"])
    fig_perplexity(R["lm"])
    fig_word_map()
    fig_trellis()
    fig_threshold(R["policy"])
    if not args.no_tests:
        print("pytest ...")
        R["tests"] = run_tests()
    (DOCS / "results.json").write_text(json.dumps(_clean(R), ensure_ascii=False, indent=1), encoding="utf-8")
    write_markdown(R)
    print(f"wrote {DOCS / 'results.md'}")


if __name__ == "__main__":
    main()
