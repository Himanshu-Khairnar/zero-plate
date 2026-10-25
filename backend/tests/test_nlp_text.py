"""Unit 1/2: tokenizer, normalisation, Devanagari, DFA dates/quantities, morphology."""

from datetime import date

from app.nlp.corpus import front_end, load_dataset, parse_bracketed
from app.nlp.fsa import interpret_date, interpret_qty, scan
from app.nlp.morphology import english_lemma, hindi_analyse, porter_stem, sentence_tense
from app.nlp.normalize import canonical_hinglish, hinglish_key
from app.nlp.tokenizer import tokenize, transliterate

SUN = date(2026, 10, 25)  # a Sunday


def test_tokenizer_keeps_offsets_and_splits_number_units():
    text = "Order 2.5kg paneer, ok?"
    toks = tokenize(text)
    assert [t.text for t in toks] == ["Order", "2.5", "kg", "paneer", ",", "ok", "?"]
    assert all(text[t.start:t.end] == t.text for t in toks)
    assert toks[1].kind == "NUM"


def test_devanagari_transliteration():
    assert transliterate("कल") == "kal"
    assert transliterate("पनीर") == "paneer"
    _, toks, _ = front_end("कल कितना पनीर चाहिए")
    assert [t.norm for t in toks] == ["kal", "kitna", "paneer", "chahiye"]


def test_hinglish_spelling_variants_share_a_key():
    for variant in ("kitnaa", "kitana", "kittna"):
        assert canonical_hinglish(variant) == "kitna"
    assert hinglish_key("chahie") == hinglish_key("chahiye") == hinglish_key("chaiye")
    assert canonical_hinglish("jyada") == "zyada"
    assert canonical_hinglish("the", {"the"}) is None  # English words are never respelled


def test_contractions_and_elongation():
    _, toks, _ = front_end("what's the sooooo forecast")
    words = [t.norm for t in toks]
    assert words[:3] == ["what", "is", "the"]
    assert "soo" in words


def test_bracket_alignment_matches_tokens():
    plain, spans = parse_bracketed("[kal|DATE] kitna [paneer|ING] chahiye")
    assert plain == "kal kitna paneer chahiye" and spans == [(0, 3, "DATE"), (10, 16, "ING")]
    for e in load_dataset():
        assert sum(t.startswith("B-") for t in e.tags) == len(e.spans), e.text


def _dates(text, today=SUN):
    words = text.split()
    tense = sentence_tense(words)
    return [interpret_date(words[m.start:m.end], today, tense) for m in scan(words) if m.kind == "DATE"]


def test_dfa_dates_and_kal_ambiguity():
    assert _dates("kal kitna waste hua")[0]["offset"] == -1        # past tense -> yesterday
    assert _dates("kal kitna paneer chahiye")[0]["offset"] == 1    # need -> tomorrow
    assert _dates("parso ka forecast")[0]["offset"] == 2
    assert _dates("order for next friday")[0]["start"] == "2026-10-30"
    d = _dates("sales last month")[0]
    assert d["days"] == 30 and d["direction"] == "past"
    assert _dates("pichle 10 din ki sales")[0]["days"] == 10
    assert _dates("day after tomorrow")[0]["offset"] == 2
    assert _dates("agle hafte")[0]["direction"] == "future"


def test_dfa_quantities_and_ambiguous_number_words():
    words = "do kilo aloo mangao".split()
    m = scan(words)
    assert m[0].kind == "QTY" and interpret_qty(words[m[0].start:m[0].end]) == (2, "kg")
    assert scan("how do we do it".split()) == []          # English "do" is not a number
    assert scan("what is in stock".split()) == []         # "is" alone is not "is hafte"


def test_porter_stemmer_and_derivation():
    assert porter_stem("caresses") == "caress"
    assert porter_stem("ponies") == "poni"
    assert porter_stem("relational") == "relat"
    assert porter_stem("generalization") == "gener"
    assert english_lemma("wastage") == english_lemma("wasted") == english_lemma("waste")
    assert english_lemma("sold") == english_lemma("selling")


def test_hindi_inflection():
    assert hindi_analyse("bikega") == ("bikna", {"tense": "future", "gender": "m"})
    assert hindi_analyse("biki")[1]["tense"] == "past"
    assert hindi_analyse("mangwao") == ("mangwana", {"mood": "imperative"})
    assert sentence_tense("kitni biryani bikegi".split()) == "future"
    assert sentence_tense("what did we sell yesterday".split()) == "past"
