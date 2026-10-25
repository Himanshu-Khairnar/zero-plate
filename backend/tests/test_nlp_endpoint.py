"""POST /api/nlp/parse, discourse (Unit 6) and the routing policy used by offline.ts."""

import json
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.nlp import evaluate as E
from app.nlp.corpus import DATA_DIR
from app.nlp.data.generate import build


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def post(client, text, history=(), **kw):
    body = {"text": text, "history": [{"role": "user", "text": h} for h in history], "today": "2026-10-25", **kw}
    res = client.post("/api/nlp/parse", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_response_shape(client):
    text = "kal kitna panner chahiye"
    r = post(client, text)
    assert set(r) >= {"intent", "confidence", "intentScores", "entities", "resolved", "language", "normalizedText",
                      "corrections", "debug"}
    assert r["intent"] == "purchase" and r["language"] == "hi-Latn"
    assert r["normalizedText"] == "kal kitna paneer chahiye"
    assert r["corrections"][0]["from"] == "panner"
    ing = next(e for e in r["entities"] if e["type"] == "INGREDIENT")
    assert ing["value"] == "Paneer" and text[ing["start"]:ing["end"]] == "panner"
    assert r["resolved"]["date"]["value"]["start"] == "2026-10-26"
    assert abs(sum(r["intentScores"].values()) - 1) < 1e-3


def test_outlet_menu_is_used_as_gazetteer(client):
    r = post(client, "how many hakka noodles did we sell yesterday", dishes=["Hakka Noodles", "Veg Momos"],
             ingredients=["Cabbage"])
    assert r["intent"] == "sales"
    assert r["resolved"]["dish"]["value"] == "Hakka Noodles"


def test_validation(client):
    assert client.post("/api/nlp/parse", json={"text": ""}).status_code == 422
    assert client.post("/api/nlp/parse", json={}).status_code == 422


def test_anaphora_and_ellipsis(client):
    r = post(client, "how much of it should i order", ["how much paneer do we have"])
    assert r["intent"] == "purchase" and r["resolved"]["ingredient"]["value"] == "Paneer"
    assert r["resolved"]["antecedents"][0]["anaphor"] == "it"
    r = post(client, "and tomorrow?", ["what do we expect to sell today"])
    assert r["intent"] == "forecast" and r["resolved"]["ellipsis"]
    r = post(client, "aur parso?", ["kal kitni biryani bikegi"])
    assert r["intent"] == "forecast" and r["resolved"]["date"]["value"]["offset"] == 2
    assert r["resolved"]["dish"]["text"] == "biryani"


def test_coref_dialogues():
    r = E.eval_coref()
    assert r["accuracy"] >= 0.9 and r["accuracy"] > r["without_history_accuracy"]


def test_routing_policy_has_no_regressions():
    p = E.eval_policy()
    assert p["at_threshold"]["test"]["regressions"] == 0
    assert p["at_threshold"]["all"]["regressions"] == 0
    assert p["at_threshold"]["test"]["combined_answer_accuracy"] > p["at_threshold"]["test"]["regex_answer_accuracy"]
    stored = json.loads((DATA_DIR / "policy.json").read_text())["threshold"]
    assert stored >= p["minimal_zero_regression_threshold"]


def test_dataset_is_reproducible_and_split_by_template():
    rows = [json.loads(line) for line in (DATA_DIR / "intents.jsonl").read_text(encoding="utf-8").splitlines()]
    assert rows == build()
    train_t = {r["template"] for r in rows if r["split"] == "train" and r["template"] is not None}
    test_t = {r["template"] for r in rows if r["split"] == "test" and r["template"] is not None}
    assert not train_t & test_t


def test_latency(client):
    post(client, "warm up")
    t = time.perf_counter()
    for q in ["kal kitna waste hua", "how much paneer should i order for next friday", "forcast for tomorrow"]:
        post(client, q)
    assert (time.perf_counter() - t) / 3 < 0.5
