"""Unit 2-5: language model, spelling, HMM tagger, WSD, classifiers, embeddings, language ID."""

import math

import numpy as np
import pytest

from app.nlp import evaluate as E
from app.nlp.classifiers import MaxEntClassifier, MultinomialNB, TfidfVectorizer, regex_intent
from app.nlp.corpus import split
from app.nlp.lm import NgramLM
from app.nlp.pipeline import get_models
from app.nlp.spell import edit_distance, plain_levenshtein


@pytest.fixture(scope="module")
def models():
    return get_models()


def test_lm_probabilities_sum_to_one_and_smoothing_ranks():
    train = [e.words for e in split("train")]
    lm = NgramLM(order=2, min_count=1).fit(train)
    for h in [("how",), ("kal",), ("<never-seen>",)]:
        for method in ("laplace", "gt"):
            assert math.isclose(sum(lm.prob(w, h, method) for w in lm.vocab), 1.0, abs_tol=1e-6)
    r = E.eval_lm()
    assert math.isinf(r["2-gram"]["mle"]["perplexity"])
    assert r["2-gram"]["gt"]["perplexity"] < r["2-gram"]["laplace"]["perplexity"]
    assert r["3-gram"]["gt"]["perplexity"] < r["3-gram"]["laplace"]["perplexity"]


def test_edit_distance():
    assert plain_levenshtein("kitten", "sitting") == 3
    assert edit_distance("wastege", "wastage") == 0.5        # vowel substitution is cheap
    assert edit_distance("panner", "paneer") <= 1.0
    assert edit_distance("ab", "ba") == 0.8                  # transposition


def test_spelling_correction(models):
    assert models.speller.correct("how much panner should i order".split())[0][2] == "paneer"
    assert models.speller.correct("forcast for tomorrow".split())[0][0] == "forecast"
    assert models.speller.correct("order zomato packets".split())[0][1] == "zomato"   # new word kept
    r = E.eval_spelling(models)
    assert r["accuracy"] >= 0.8 and r["false_correction_rate_clean_test"] <= 0.02


def test_hmm_viterbi_and_tagging_scores(models):
    v = models.hmm.viterbi("kal kitna paneer chahiye".split())
    assert v["tags"] == ["B-DATE", "O", "B-ING", "O"]
    assert v["delta"].shape == (4, len(models.hmm.tags))
    for e in split("test"):  # the HMM never produces an ill-formed I- tag
        tags = models.hmm.tag(e.words)
        for prev, cur in zip(["O"] + tags, tags):
            assert not cur.startswith("I-") or prev[2:] == cur[2:]
    t = E.eval_tagging(models)
    assert t["test"]["hmm_viterbi"]["entity_f1"] > 0.85
    assert t["test"]["hybrid_pipeline"]["entity_f1"] > 0.95
    assert t["unseen_names"]["hybrid_pipeline"]["entity_f1"] >= t["unseen_names"]["rule_baseline"]["entity_f1"]


def test_lesk_wsd():
    r = E.eval_wsd()
    assert r["accuracy"] > r["most_frequent_sense_baseline"] and r["accuracy"] >= 0.8


def test_naive_bayes_and_maxent_on_toy_data():
    docs = [["sell", "yesterday"], ["sell", "revenue"], ["waste", "bin"], ["waste", "throw"]]
    y = ["sales", "sales", "waste", "waste"]
    nb = MultinomialNB().fit(docs, y)
    assert max(nb.predict_proba(["revenue"]).items(), key=lambda kv: kv[1])[0] == "sales"
    vec = TfidfVectorizer().fit(docs)
    me = MaxEntClassifier(epochs=200).fit(vec.transform(docs), y)
    p = me.predict_proba(vec.transform_one(["bin"]))
    assert p["waste"] > 0.8 and math.isclose(sum(p.values()), 1.0, abs_tol=1e-5)


def test_intent_classifiers_beat_regex_baseline(models):
    r = E.eval_intents(models)
    sel = r["classifiers"][r["selected"]]
    assert r["selected"] in r["dev_accuracy"]
    assert sel["accuracy"] >= 0.85
    assert sel["accuracy"] > r["classifiers"]["regex_baseline"]["accuracy"]
    assert sel["by_language"]["hi-Latn"] > r["classifiers"]["regex_baseline"]["by_language"]["hi-Latn"]
    assert regex_intent("How much paneer should I order for the weekend?") == "purchase"


def test_embeddings_align_seed_pairs(models):
    emb = models.embeddings
    assert emb.similarity("chai", "tea") > 0.8
    assert emb.similarity("chai", "tea") > emb.similarity("chai", "onion")
    norms = np.linalg.norm(emb.W, axis=1)
    assert np.allclose(norms[norms > 0], 1, atol=1e-4)
    assert models.gaz.resolve(["tea"], "DISH", emb.similarity)[0] == "Masala Chai"


def test_language_id(models):
    assert E.eval_langid(models)["sentence_accuracy_en_vs_hinglish"] >= 0.9
