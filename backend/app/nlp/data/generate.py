"""Build the intent + slot dataset (English and Hinglish) with a fixed seed.

    python -m app.nlp.data.generate     # rewrites app/nlp/data/intents.jsonl

Each example is one user question in *bracket notation* - the slot spans are
marked inline, e.g. ``[kal|DATE] kitna [paneer|ING] chahiye`` - with an
intent label, a language label (en | hi-Latn) and a source (template |
hand). The same file therefore trains the intent classifiers (Unit 4/5),
the HMM slot tagger (Unit 3) and the language model (Unit 2).

Split policy (so the test set measures generalisation, not memorisation):
* templated examples are split *by template*: every template belongs to
  exactly one split, so no test sentence shares its frame with training;
* hand-written examples are split 70/30 stratified by intent with the seed.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

SEED = 13
OUT = Path(__file__).with_name("intents.jsonl")
FILLS_PER_TEMPLATE = 3

DISHES = ["paneer butter masala", "chicken biryani", "butter chicken", "masala dosa", "pav bhaji", "vada pav",
          "dal khichdi", "chole bhature", "veg pulao", "filter coffee", "gulab jamun", "veg thali",
          "paneer tikka", "dal makhani", "veg biryani", "chicken curry", "fish fry", "masala chai", "biryani",
          "dosa", "thali"]
ING_EN = ["paneer", "chicken", "potatoes", "onions", "tomatoes", "rice", "basmati rice", "wheat flour",
          "cooking oil", "butter", "milk", "sugar", "chickpeas", "toor dal", "spice mix", "pav bread",
          "coffee powder", "fresh cream", "dosa batter", "tea leaves", "vegetables", "tea", "eggs", "curd"]
ING_HI = ["paneer", "aloo", "pyaaz", "tamatar", "doodh", "cheeni", "chawal", "atta", "tel", "makhan", "malai",
          "chana", "dal", "murgi", "sabzi", "chai patti", "anda", "dahi", "chicken", "butter", "basmati chawal"]
QTY_EN = [("2.5", "kg"), ("10", "kg"), ("5", "litres"), ("20", "kg"), ("500", "grams"), ("50", "pieces"),
          ("3", "kg"), ("12", "litres"), ("two", "kg"), ("1.5", "kg")]
QTY_HI = [("do", "kilo"), ("teen", "kilo"), ("5", "kilo"), ("10", "litre"), ("paanch", "kilo"), ("dhai", "kilo"),
          ("2", "kg"), ("20", "packet")]
DATE_PAST_EN = ["yesterday", "today", "last week", "last month", "this week", "past 7 days", "last 14 days",
                "on monday", "this month", "last weekend", "past 3 days"]
DATE_FUT_EN = ["tomorrow", "next friday", "this weekend", "next week", "day after tomorrow", "on saturday",
               "tomorrow night", "next 3 days", "today", "next monday"]
DATE_PAST_HI = ["kal", "aaj", "pichle hafte", "pichle mahine", "is hafte", "pichle 7 din", "is mahine",
                "somvar ko", "pichle 10 din"]
DATE_FUT_HI = ["kal", "parso", "agle hafte", "is weekend", "shukravar ko", "aaj raat", "agle 3 din", "kal subah"]

# (intent, lang, tense of DATE fillers, template). Slots: {DISH} {ING} {DATE} {QTY}
TEMPLATES: list[tuple[str, str, str, str]] = [
    # ---------------------------------------------------------------- waste
    ("waste", "en", "past", "which dish did we waste most {DATE}"),
    ("waste", "en", "past", "how much {DISH} was wasted {DATE}"),
    ("waste", "en", "past", "show me the waste report for {DATE}"),
    ("waste", "en", "past", "what was our total wastage {DATE}"),
    ("waste", "en", "past", "how much food did we throw away {DATE}"),
    ("waste", "en", "past", "why are we wasting so much {DISH}"),
    ("waste", "en", "past", "how many plates of {DISH} went in the bin {DATE}"),
    ("waste", "en", "past", "what is the biggest reason for waste {DATE}"),
    ("waste", "en", "past", "how much {ING} spoiled {DATE}"),
    ("waste", "en", "past", "top wasted items {DATE}"),
    ("waste", "en", "past", "what did the waste cost us {DATE}"),
    ("waste", "en", "past", "how much leftover {DISH} did we bin {DATE}"),
    ("waste", "hi-Latn", "past", "{DATE} kitna waste hua"),
    ("waste", "hi-Latn", "past", "{DATE} kitna khana phenka"),
    ("waste", "hi-Latn", "past", "{DISH} kitna waste hua {DATE}"),
    ("waste", "hi-Latn", "past", "sabse zyada waste kis dish ka hua {DATE}"),
    ("waste", "hi-Latn", "past", "{DATE} kitna {ING} kharab hua"),
    ("waste", "hi-Latn", "past", "waste ka kharcha kitna hua {DATE}"),
    ("waste", "hi-Latn", "past", "{DISH} kyun itna bach raha hai"),
    ("waste", "hi-Latn", "past", "barbaadi kitni hui {DATE}"),
    ("waste", "hi-Latn", "past", "{DATE} ka waste report dikhao"),
    ("waste", "hi-Latn", "past", "{DATE} kitni plate {DISH} phenki"),
    # ---------------------------------------------------------------- forecast
    ("forecast", "en", "future", "what do we expect to sell {DATE}"),
    ("forecast", "en", "future", "how many {DISH} will we sell {DATE}"),
    ("forecast", "en", "future", "forecast for {DATE}"),
    ("forecast", "en", "future", "what is the demand for {DISH} {DATE}"),
    ("forecast", "en", "future", "predict sales of {DISH} for {DATE}"),
    ("forecast", "en", "future", "how busy will we be {DATE}"),
    ("forecast", "en", "future", "expected plates {DATE}"),
    ("forecast", "en", "future", "how many customers are we expecting {DATE}"),
    ("forecast", "en", "future", "what will demand look like {DATE}"),
    ("forecast", "en", "future", "projected demand for {DISH} {DATE}"),
    ("forecast", "hi-Latn", "future", "{DATE} kitna bikega"),
    ("forecast", "hi-Latn", "future", "{DATE} kitni {DISH} bikegi"),
    ("forecast", "hi-Latn", "future", "{DATE} ka forecast batao"),
    ("forecast", "hi-Latn", "future", "{DISH} ki demand kitni hogi {DATE}"),
    ("forecast", "hi-Latn", "future", "{DATE} kitne customer aayenge"),
    ("forecast", "hi-Latn", "future", "{DATE} kitni plate jayengi"),
    ("forecast", "hi-Latn", "future", "{DATE} ka anumaan kya hai"),
    ("forecast", "hi-Latn", "future", "{DATE} bheed kitni hogi"),
    # ---------------------------------------------------------------- prep
    ("prep", "en", "future", "what should we prep {DATE}"),
    ("prep", "en", "future", "show the prep plan for {DATE}"),
    ("prep", "en", "future", "how many plates of {DISH} should we cook {DATE}"),
    ("prep", "en", "future", "is the prep plan for {DATE} approved"),
    ("prep", "en", "future", "what is on the prep list {DATE}"),
    ("prep", "en", "future", "how much {DISH} should the kitchen make {DATE}"),
    ("prep", "en", "future", "prep sheet for {DATE}"),
    ("prep", "en", "future", "what do we need to prepare {DATE}"),
    ("prep", "en", "future", "kitchen production plan {DATE}"),
    ("prep", "hi-Latn", "future", "{DATE} kya banana hai"),
    ("prep", "hi-Latn", "future", "{DATE} kitna {DISH} banana hai"),
    ("prep", "hi-Latn", "future", "{DATE} ka prep plan dikhao"),
    ("prep", "hi-Latn", "future", "{DATE} kitni plate {DISH} pakani hai"),
    ("prep", "hi-Latn", "future", "kitchen ko {DATE} kya tayyar karna hai"),
    ("prep", "hi-Latn", "future", "{DATE} ki taiyari kya hai"),
    ("prep", "hi-Latn", "future", "{DATE} ka prep plan approve hua kya"),
    ("prep", "hi-Latn", "future", "rasoi mein {DATE} kya pakana hai"),
    # ---------------------------------------------------------------- stock
    ("stock", "en", "future", "how much {ING} do we have"),
    ("stock", "en", "future", "how much {ING} is left"),
    ("stock", "en", "future", "what is in stock right now"),
    ("stock", "en", "future", "current inventory of {ING}"),
    ("stock", "en", "future", "is {ING} running low"),
    ("stock", "en", "future", "which items expire {DATE}"),
    ("stock", "en", "future", "do we have {QTY} of {ING}"),
    ("stock", "en", "future", "check stock levels of {ING}"),
    ("stock", "en", "future", "what is our stock of {ING}"),
    ("stock", "en", "future", "are we out of {ING}"),
    ("stock", "hi-Latn", "future", "{ING} kitna bacha hai"),
    ("stock", "hi-Latn", "future", "{ING} kitna hai store mein"),
    ("stock", "hi-Latn", "future", "stock mein kya kya hai"),
    ("stock", "hi-Latn", "future", "{ING} khatam ho gaya kya"),
    ("stock", "hi-Latn", "future", "{DATE} kya expire hoga"),
    ("stock", "hi-Latn", "future", "{ING} ka stock kitna hai"),
    ("stock", "hi-Latn", "future", "godown mein kitna {ING} pada hai"),
    ("stock", "hi-Latn", "future", "{QTY} {ING} hai kya"),
    # ---------------------------------------------------------------- sales
    ("sales", "en", "past", "how much did we sell {DATE}"),
    ("sales", "en", "past", "what were the sales {DATE}"),
    ("sales", "en", "past", "how many {DISH} did we sell {DATE}"),
    ("sales", "en", "past", "what is our best seller {DATE}"),
    ("sales", "en", "past", "total revenue {DATE}"),
    ("sales", "en", "past", "how much money did we make {DATE}"),
    ("sales", "en", "past", "which dish was most popular {DATE}"),
    ("sales", "en", "past", "how many customer orders did we get {DATE}"),
    ("sales", "en", "past", "sales report for {DATE}"),
    ("sales", "en", "past", "how many plates of {DISH} were sold {DATE}"),
    ("sales", "hi-Latn", "past", "{DATE} kitna bika"),
    ("sales", "hi-Latn", "past", "{DATE} kitni {DISH} biki"),
    ("sales", "hi-Latn", "past", "{DATE} kitni kamai hui"),
    ("sales", "hi-Latn", "past", "{DATE} sabse zyada kya bika"),
    ("sales", "hi-Latn", "past", "{DATE} ki sales kitni thi"),
    ("sales", "hi-Latn", "past", "{DATE} kitne order aaye"),
    ("sales", "hi-Latn", "past", "{DATE} ka galla kitna hua"),
    ("sales", "hi-Latn", "past", "{DISH} kitni bikti hai"),
    # ---------------------------------------------------------------- purchase
    ("purchase", "en", "future", "how much {ING} should i order {DATE}"),
    ("purchase", "en", "future", "how much {ING} should we buy for {DATE}"),
    ("purchase", "en", "future", "place a purchase order for {QTY} of {ING}"),
    ("purchase", "en", "future", "do we need to order {ING} {DATE}"),
    ("purchase", "en", "future", "what should we buy from the supplier {DATE}"),
    ("purchase", "en", "future", "order {QTY} {ING} {DATE}"),
    ("purchase", "en", "future", "suggest an order for {ING}"),
    ("purchase", "en", "future", "how much {ING} to purchase for {DATE}"),
    ("purchase", "en", "future", "restock {ING} for {DATE}"),
    ("purchase", "hi-Latn", "future", "{DATE} kitna {ING} mangwana hai"),
    ("purchase", "hi-Latn", "future", "{DATE} ke liye kitna {ING} chahiye"),
    ("purchase", "hi-Latn", "future", "{ING} kitna kharidna hai {DATE}"),
    ("purchase", "hi-Latn", "future", "supplier se {QTY} {ING} mangao"),
    ("purchase", "hi-Latn", "future", "{DATE} {ING} order karna padega kya"),
    ("purchase", "hi-Latn", "future", "{ING} ka order kitna dena hai"),
    ("purchase", "hi-Latn", "future", "{DATE} kitna {ING} lena padega"),
    ("purchase", "hi-Latn", "future", "{DATE} kitna {ING} chahiye"),
]

# Hand-written examples (bracket notation). Includes ambiguous words for WSD
# ("order", "stock", "plate"), code-mixing and phrasing no template covers.
HAND: list[tuple[str, str, str]] = [
    # waste
    ("waste", "en", "which dish did we waste most [last month|DATE]?"),
    ("waste", "en", "what are we throwing away the most"),
    ("waste", "en", "how bad was plate waste [yesterday|DATE]"),
    ("waste", "en", "did we bin a lot of [rice|ING] [this week|DATE]"),
    ("waste", "en", "where is our food waste coming from"),
    ("waste", "en", "cost of spoilage [last month|DATE]"),
    ("waste", "en", "customers left a lot on the plate [today|DATE], how much was it"),
    ("waste", "en", "how many kilos of food did we lose [last week|DATE]"),
    ("waste", "en", "overproduction losses [past 7 days|DATE]"),
    ("waste", "en", "was [gulab jamun|DISH] wasted [yesterday|DATE]"),
    ("waste", "en", "give me a wastage summary"),
    ("waste", "en", "what got thrown out [last night|DATE]"),
    ("waste", "hi-Latn", "[aaj|DATE] kitna waste hua"),
    ("waste", "hi-Latn", "[kal|DATE] kitna khana bacha aur phenka"),
    ("waste", "hi-Latn", "sabse zyada kya waste ho raha hai"),
    ("waste", "hi-Latn", "[pichle mahine|DATE] barbaadi kitni hui"),
    ("waste", "hi-Latn", "[biryani|DISH] itni waste kyun ho rahi hai"),
    ("waste", "hi-Latn", "kitna maal kharab ho gaya [is hafte|DATE]"),
    ("waste", "hi-Latn", "plate mein kitna khana chhoda customers ne"),
    ("waste", "hi-Latn", "[kal|DATE] [paneer|ING] kitna sad gaya"),
    ("waste", "hi-Latn", "wastage kitna hai [is mahine|DATE]"),
    # forecast
    ("forecast", "en", "what do we expect to sell [tomorrow|DATE]?"),
    ("forecast", "en", "how many people will come [this weekend|DATE]"),
    ("forecast", "en", "will [butter chicken|DISH] sell well [on friday|DATE]"),
    ("forecast", "en", "give me the demand outlook for [next week|DATE]"),
    ("forecast", "en", "is it going to be a busy day [tomorrow|DATE]"),
    ("forecast", "en", "predicted footfall [day after tomorrow|DATE]"),
    ("forecast", "en", "how many orders should we expect [tonight|DATE]"),
    ("forecast", "en", "what will the rain do to demand [tomorrow|DATE]"),
    ("forecast", "en", "expected covers for [saturday|DATE]"),
    ("forecast", "hi-Latn", "[kal|DATE] kitni bikri hogi"),
    ("forecast", "hi-Latn", "[kal|DATE] kitne log aayenge"),
    ("forecast", "hi-Latn", "[agle hafte|DATE] ka forecast kya hai"),
    ("forecast", "hi-Latn", "[parso|DATE] [dosa|DISH] kitna bikega"),
    ("forecast", "hi-Latn", "[weekend|DATE] pe kitna rush hoga"),
    ("forecast", "hi-Latn", "baarish mein [kal|DATE] kitna bikega"),
    ("forecast", "hi-Latn", "[aaj raat|DATE] kitne order aayenge"),
    # prep
    ("prep", "en", "what should we prep [tomorrow|DATE]?"),
    ("prep", "en", "has the prep plan been approved"),
    ("prep", "en", "how many portions of [dal makhani|DISH] do we cook [tomorrow|DATE]"),
    ("prep", "en", "what's on the prep list for [tomorrow|DATE]"),
    ("prep", "en", "batch cooking plan for [saturday|DATE]"),
    ("prep", "en", "how much [biryani|DISH] should the chef make [tonight|DATE]"),
    ("prep", "en", "prep quantities for [next monday|DATE]"),
    ("prep", "en", "make the stock for the curry base [tomorrow|DATE] morning, what else to prep"),
    ("prep", "hi-Latn", "[kal|DATE] kya kya banana hai"),
    ("prep", "hi-Latn", "[kal|DATE] ka prep plan dikhao"),
    ("prep", "hi-Latn", "[kal|DATE] kitni plate [biryani|DISH] banani hai"),
    ("prep", "hi-Latn", "chef ko [kal|DATE] ke liye kya tayyar karna hai"),
    ("prep", "hi-Latn", "[kal subah|DATE] kitna [masala dosa|DISH] pakana hai"),
    ("prep", "hi-Latn", "prep plan approve hua kya"),
    # stock
    ("stock", "en", "how much [paneer|ING] do we have left?"),
    ("stock", "en", "what's in the stock room"),
    ("stock", "en", "what is about to expire"),
    ("stock", "en", "anything expiring [tomorrow|DATE]"),
    ("stock", "en", "show inventory levels"),
    ("stock", "en", "how many kilos of [onions|ING] are in the store"),
    ("stock", "en", "is there enough [milk|ING] for [today|DATE]"),
    ("stock", "en", "which ingredients are out of stock"),
    ("stock", "en", "do we still have [fresh cream|ING]"),
    ("stock", "en", "stock check please"),
    ("stock", "hi-Latn", "[paneer|ING] kitna bacha hai"),
    ("stock", "hi-Latn", "[doodh|ING] khatam ho gaya kya"),
    ("stock", "hi-Latn", "store mein kitna [aloo|ING] hai"),
    ("stock", "hi-Latn", "kya kya expire hone wala hai"),
    ("stock", "hi-Latn", "[chawal|ING] kitne kilo pade hain"),
    ("stock", "hi-Latn", "abhi stock mein kya hai"),
    ("stock", "hi-Latn", "[tel|ING] kitna bacha"),
    # sales
    ("sales", "en", "how much did we sell [last week|DATE]?"),
    ("sales", "en", "what's our best selling dish"),
    ("sales", "en", "revenue [this month|DATE]"),
    ("sales", "en", "how many customer orders came in [today|DATE]"),
    ("sales", "en", "how did [vada pav|DISH] do [yesterday|DATE]"),
    ("sales", "en", "what were the takings [last weekend|DATE]"),
    ("sales", "en", "how many plates did we sell [yesterday|DATE]"),
    ("sales", "en", "what is popular with customers"),
    ("sales", "en", "earnings for [past 30 days|DATE]"),
    ("sales", "en", "how many orders did the dining room serve [today|DATE]"),
    ("sales", "hi-Latn", "[kal|DATE] kitna bika"),
    ("sales", "hi-Latn", "[aaj|DATE] kitni kamai hui"),
    ("sales", "hi-Latn", "sabse zyada kaunsi dish bikti hai"),
    ("sales", "hi-Latn", "[pichle hafte|DATE] ka galla kitna tha"),
    ("sales", "hi-Latn", "[kal|DATE] kitne order aaye the"),
    ("sales", "hi-Latn", "[pav bhaji|DISH] kitni biki [is hafte|DATE]"),
    ("sales", "hi-Latn", "dhandha kaisa chal raha hai [is mahine|DATE]"),
    # purchase
    ("purchase", "en", "how much [paneer|ING] should i order for the [weekend|DATE]?"),
    ("purchase", "en", "what should i buy [tomorrow|DATE]"),
    ("purchase", "en", "raise a purchase order for [onions|ING]"),
    ("purchase", "en", "do i need to restock [milk|ING]"),
    ("purchase", "en", "we are short on [tomatoes|ING], how much to buy"),
    ("purchase", "en", "order [rice|ING] from the supplier for [next week|DATE]"),
    ("purchase", "en", "how many kilos of [chicken|ING] to buy for [saturday|DATE]"),
    ("purchase", "en", "buy [veg stock|ING] cubes for [tomorrow|DATE]"),
    ("purchase", "en", "supplier order for [pav bread|ING] [tomorrow morning|DATE]"),
    ("purchase", "hi-Latn", "[kal|DATE] kitna [paneer|ING] chahiye"),
    ("purchase", "hi-Latn", "[kal|DATE] ke liye kitna [doodh|ING] mangwana hai"),
    ("purchase", "hi-Latn", "[pyaaz|ING] kitna kharidna padega"),
    ("purchase", "hi-Latn", "supplier ko kya order dena hai"),
    ("purchase", "hi-Latn", "[weekend|DATE] ke liye [chicken|ING] kitna lena hai"),
    ("purchase", "hi-Latn", "[do|QTY] [kilo|UNIT] [tamatar|ING] mangao [kal|DATE] ke liye"),
    ("purchase", "hi-Latn", "[aloo|ING] ka order lagana hai"),
    ("purchase", "hi-Latn", "[agle hafte|DATE] ke liye [chawal|ING] kitna mangwaye"),
    # help / greeting
    ("help", "en", "hi"), ("help", "en", "hello"), ("help", "en", "hey there"), ("help", "en", "good morning"),
    ("help", "en", "what can you do"), ("help", "en", "help"), ("help", "en", "how do i use this"),
    ("help", "en", "what questions can i ask you"), ("help", "en", "thanks"), ("help", "en", "thank you so much"),
    ("help", "en", "who are you"), ("help", "en", "what can i ask about"), ("help", "en", "good evening"),
    ("help", "en", "are you there"), ("help", "en", "ok great thanks"),
    ("help", "hi-Latn", "namaste"), ("help", "hi-Latn", "kya kar sakte ho"), ("help", "hi-Latn", "madad chahiye"),
    ("help", "hi-Latn", "isko kaise use karu"), ("help", "hi-Latn", "shukriya"), ("help", "hi-Latn", "aap kaun ho"),
    ("help", "hi-Latn", "kya pooch sakta hu"), ("help", "hi-Latn", "helo bhai"), ("help", "hi-Latn", "kya haal hai"),
    ("help", "hi-Latn", "dhanyavaad"), ("help", "hi-Latn", "mujhe madad karo"), ("help", "hi-Latn", "suprabhat"),
    # unknown / out of domain
    ("unknown", "en", "what is the weather in delhi"), ("unknown", "en", "tell me a joke"),
    ("unknown", "en", "who won the cricket match"), ("unknown", "en", "what is the capital of france"),
    ("unknown", "en", "book a cab to the airport"), ("unknown", "en", "play some music"),
    ("unknown", "en", "translate this to french"), ("unknown", "en", "set an alarm for 6"),
    ("unknown", "en", "who is the prime minister"), ("unknown", "en", "write me a poem about love"),
    ("unknown", "en", "what movie should i watch"), ("unknown", "en", "how do i fix my laptop"),
    ("unknown", "en", "recommend a good phone"), ("unknown", "en", "what is two plus two"),
    ("unknown", "en", "send an email to my boss"),
    ("unknown", "hi-Latn", "mausam kaisa hai"), ("unknown", "hi-Latn", "ek joke sunao"),
    ("unknown", "hi-Latn", "cricket score kya hai"), ("unknown", "hi-Latn", "koi movie batao"),
    ("unknown", "hi-Latn", "gaana bajao"), ("unknown", "hi-Latn", "kaunsa phone lu"),
    ("unknown", "hi-Latn", "mera laptop kharab hai"), ("unknown", "hi-Latn", "pradhan mantri kaun hai"),
    ("unknown", "hi-Latn", "cab book karo airport ke liye"), ("unknown", "hi-Latn", "ek kavita likho"),
    ("unknown", "hi-Latn", "train kab aayegi"), ("unknown", "hi-Latn", "bijli ka bill kitna aaya"),
]


def _fill(template: str, tense: str, lang: str, rng: random.Random) -> str:
    hi = lang == "hi-Latn"
    out = template
    if "{DISH}" in out:
        out = out.replace("{DISH}", f"[{rng.choice(DISHES)}|DISH]", 1)
    if "{ING}" in out:
        out = out.replace("{ING}", f"[{rng.choice(ING_HI if hi else ING_EN)}|ING]", 1)
    if "{QTY}" in out:
        n, u = rng.choice(QTY_HI if hi else QTY_EN)
        out = out.replace("{QTY}", f"[{n}|QTY] [{u}|UNIT]", 1)
    if "{DATE}" in out:
        pool = (DATE_FUT_HI if tense == "future" else DATE_PAST_HI) if hi else (
            DATE_FUT_EN if tense == "future" else DATE_PAST_EN)
        d = rng.choice(pool)
        if d.startswith("on ") or d.endswith(" ko"):  # keep the preposition/postposition outside the span
            word = d.split()[1] if d.startswith("on ") else d.split()[0]
            out = out.replace("{DATE}", f"on [{word}|DATE]" if d.startswith("on ") else f"[{word}|DATE] ko", 1)
        else:
            out = out.replace("{DATE}", f"[{d}|DATE]", 1)
    return out


def build() -> list[dict]:
    rng = random.Random(SEED)
    rows: list[dict] = []
    # template -> split: within each (intent, lang) group every 4th template is held out for test
    seen: dict[tuple[str, str], int] = {}
    for tid, (intent, lang, tense, tpl) in enumerate(TEMPLATES):
        k = seen.get((intent, lang), 0)
        seen[(intent, lang)] = k + 1
        split = "test" if k % 4 == 3 else "train"
        made: set[str] = set()
        for _ in range(FILLS_PER_TEMPLATE * 3):
            if len(made) >= FILLS_PER_TEMPLATE:
                break
            s = _fill(tpl, tense, lang, rng)
            if s not in made:
                made.add(s)
                rows.append({"text": s, "intent": intent, "lang": lang, "source": "template",
                             "template": tid, "split": split})
    by_intent: dict[str, list[tuple[str, str, str]]] = {}
    for h in HAND:
        by_intent.setdefault(h[0], []).append(h)
    for intent, items in by_intent.items():
        items = list(items)
        rng.shuffle(items)
        n_test = round(len(items) * 0.3)
        for i, (_, lang, text) in enumerate(items):
            rows.append({"text": text, "intent": intent, "lang": lang, "source": "hand", "template": None,
                         "split": "test" if i < n_test else "train"})
    return rows


def main() -> None:
    rows = build()
    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    tr = sum(r["split"] == "train" for r in rows)
    print(f"wrote {len(rows)} examples ({tr} train / {len(rows) - tr} test) to {OUT}")


if __name__ == "__main__":
    main()
