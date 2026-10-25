"""Hand-written lexical resources shared by the NLP pipeline.

Everything here is small and written by hand for the restaurant domain:

* default gazetteers (dish / ingredient names) used when the caller does not
  send the outlet's own menu,
* a Hinglish -> English bilingual dictionary (cross-lingual mapping, Unit 5),
* Hinglish spelling variants (regex normalisation, Unit 1),
* Hindi number words and units (finite-state recogniser, Unit 1/2),
* English and Hinglish function words (stop words).
"""

from __future__ import annotations

# --------------------------------------------------------------------------- gazetteers
DEFAULT_DISHES: list[str] = [
    "Veg Thali", "Paneer Butter Masala", "Chicken Biryani", "Butter Chicken", "Masala Dosa",
    "Pav Bhaji", "Vada Pav", "Dal Khichdi", "Chole Bhature", "Veg Pulao", "Filter Coffee",
    "Gulab Jamun", "Paneer Tikka", "Dal Makhani", "Veg Biryani", "Chicken Curry",
    "Mutton Rogan Josh", "Fish Fry", "Masala Chai",
]

DEFAULT_INGREDIENTS: list[str] = [
    "Basmati rice", "Wheat flour", "Paneer", "Chicken", "Potato", "Onion", "Tomato",
    "Cooking oil", "Butter", "Milk", "Sugar", "Chickpeas", "Lentils (toor)", "Spice mix",
    "Pav bread", "Coffee powder", "Fresh cream", "Dosa batter", "Tea leaves", "Vegetables",
    "Eggs", "Curd",
]

# --------------------------------------------------------------------------- cross-lingual
# Hinglish (Hindi in Latin script) -> English. Keys are canonical Hinglish
# lemmas (after normalisation); values are English lemmas (multi-word values
# use "_" so they stay one token).
HI_EN: dict[str, str] = {
    # question / function words
    "kitna": "how_much", "kitne": "how_many", "kya": "what", "kaun": "who", "kaunsa": "which",
    "kis": "which", "kyun": "why", "kab": "when", "kaise": "how", "sabse": "most", "zyada": "more",
    "kam": "less", "bahut": "very", "aur": "and", "ya": "or", "nahi": "not", "hai": "is",
    "mein": "in", "ka": "of", "ke": "of", "ki": "of", "ko": "to", "se": "from", "liye": "for",
    "wala": "one", "abhi": "now", "kuch": "some", "sab": "all", "itna": "so_much",
    # time
    "aaj": "today", "kal": "tomorrow", "parso": "day_after_tomorrow", "din": "day",
    "hafta": "week", "mahina": "month", "agla": "next", "pichla": "last", "raat": "night",
    "subah": "morning", "shaam": "evening", "somvar": "monday", "mangalvar": "tuesday",
    "budhvar": "wednesday", "guruvar": "thursday", "shukravar": "friday", "shanivar": "saturday",
    "ravivar": "sunday",
    # verbs (lemmas produced by morphology.hindi_lemma)
    "hona": "be", "bikna": "sell", "bechna": "sell", "bachna": "left", "phenkna": "throw",
    "mangwana": "order", "kharidna": "buy", "lena": "take", "dena": "give", "banana": "make",
    "pakana": "cook", "aana": "come", "jana": "go", "dikhana": "show", "batana": "tell",
    "chahiye": "need", "karna": "do", "khatam": "finished", "kharab": "spoil", "sadna": "rot",
    "tayyar": "prepare", "padna": "must", "sunana": "tell", "lagna": "need",
    # nouns
    "khana": "food", "barbaadi": "waste", "kamai": "revenue", "galla": "revenue",
    "bikri": "sales", "taiyari": "preparation", "maal": "stock", "godown": "store",
    "bheed": "crowd", "grahak": "customer", "anumaan": "forecast", "kharcha": "cost",
    "thali": "plate", "plate": "plate", "dukaan": "shop", "rasoi": "kitchen", "madad": "help",
    "shukriya": "thanks", "namaste": "hello", "mausam": "weather",
    # food words
    "chai": "tea", "sabzi": "vegetable", "aloo": "potato", "pyaaz": "onion", "tamatar": "tomato",
    "doodh": "milk", "cheeni": "sugar", "chawal": "rice", "atta": "flour", "tel": "oil",
    "makhan": "butter", "malai": "cream", "chana": "chickpeas", "dal": "lentils",
    "murgi": "chicken", "anda": "egg", "dahi": "curd", "patti": "leaves",
}

# Canonical Hinglish spellings. Keys are *phonetic keys* (see
# normalize.hinglish_key) so "kitnaa", "kitana" and "kittna" all map to "kitna".
HINGLISH_CANONICAL: list[str] = [
    "kitna", "kitni", "kitne", "kya", "kyun", "kaun", "kaunsa", "kis", "kab", "kaise", "sabse",
    "zyada", "bahut", "aur", "nahi", "hai", "hain", "mein", "liye", "abhi", "kuch", "aaj", "kal",
    "parso", "hafte", "hafta", "mahine", "mahina", "agle", "agli", "agla", "pichle", "pichla",
    "pichli", "chahiye", "batao", "dikhao", "bika", "biki", "bike", "bikega", "bikegi", "bikenge",
    "bacha", "bachi", "bache", "phenka", "phenki", "phenke", "mangwana", "mangwao", "mangao",
    "kharidna", "kharido", "banana", "banao", "banega", "pakana", "pakani", "khana", "barbaadi",
    "kamai", "galla", "taiyari", "tayyar", "bheed", "grahak", "anumaan", "kharcha", "chai",
    "sabzi", "aloo", "pyaaz", "tamatar", "doodh", "cheeni", "chawal", "atta", "makhan", "malai",
    "chana", "murgi", "anda", "dahi", "hua", "hui", "hue", "hoga", "hogi", "honge", "tha", "thi",
    "the", "kharab", "khatam", "namaste", "shukriya", "madad", "mausam", "aayenge", "jayengi",
    "padega", "lagega", "somvar", "shukravar", "shanivar", "ravivar", "subah", "shaam", "din",
]

# Hindi number words (Latin script). "do" is ambiguous with English "do"; the
# DFA only accepts it when a unit follows.
HI_NUMBERS: dict[str, float] = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5, "panch": 5, "chhe": 6, "saat": 7,
    "aath": 8, "nau": 9, "das": 10, "bees": 20, "pachaas": 50, "sau": 100, "dedh": 1.5,
    "dhai": 2.5, "aadha": 0.5,
}
EN_NUMBERS: dict[str, float] = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "twenty": 20, "fifty": 50, "hundred": 100, "half": 0.5, "a": 1,
}

UNITS: dict[str, str] = {
    "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg",
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "l": "l", "ltr": "l", "ltrs": "l", "litre": "l", "litres": "l", "liter": "l", "liters": "l",
    "ml": "ml", "pcs": "pcs", "pc": "pcs", "piece": "pcs", "pieces": "pcs", "packet": "pcs",
    "packets": "pcs", "plates": "plates", "plate": "plates", "portions": "plates",
    "portion": "plates", "dozen": "dozen", "crate": "crate", "crates": "crate", "bags": "bag",
    "bag": "bag",
}

EN_STOP: set[str] = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "do", "does", "did", "we", "i",
    "you", "our", "us", "me", "my", "of", "for", "to", "in", "on", "at", "it", "this", "that",
    "what", "how", "which", "and", "or", "so", "much", "many", "should", "will", "can", "have",
    "has", "there", "any", "some", "with", "from", "by", "about", "please", "show", "tell",
}
HI_STOP: set[str] = {
    "hai", "hain", "ka", "ke", "ki", "ko", "se", "mein", "ne", "bhi", "to", "toh", "kya", "aur",
    "ho", "tha", "thi", "the", "hua", "liye", "wala", "wali", "bhai", "ji", "na", "yeh", "ye",
}

# Pronouns / anaphors handled by the discourse module (Unit 6).
ANAPHORS: dict[str, str] = {
    "it": "en", "that": "en", "this": "en", "them": "en", "those": "en", "these": "en",
    "same": "en", "one": "en",
    "uska": "hi", "uski": "hi", "uske": "hi", "usko": "hi", "use": "hi", "usse": "hi",
    "iska": "hi", "iski": "hi", "iske": "hi", "isko": "hi", "woh": "hi", "wo": "hi", "vo": "hi",
    "voh": "hi", "yeh": "hi", "ye": "hi",
}

# A small list of frequent English words, so the spelling corrector does not
# "fix" ordinary words that happen to be absent from the training questions.
COMMON_EN: set[str] = set("""
a about above after again against all almost also always am among an and another any anything are around as ask
at away back bad be because been before being below best better between big both bring but buy by call came can
cannot case change check close come could day days did different do does doing done down during each early either
else end enough even ever every everything few find first for from full get give go going gone good got great had
half happen has have having he help her here high him his how however i if in instead into is it its just keep
kind know large last late later least less let like little long look lot lots low made make many may me mean
might more most much must my need never new next no not nothing now number of off often old on once one only
open or other our out over own part per place plan please point put quite rather really right same say see
seem send set several shall she short should show side since small so some something soon start still stop such
sure take tell than thank thanks that the their them then there these they thing things think this those though
through till time to today together tomorrow too top total toward try turn two under until up upon us use used
very want was way we week well went were what when where whether which while who whole why will with within
without work would year yes yet you your again also amount approve approved available average bill book busy
cheap cost costs count customer customers delivery dish dishes enough expensive expire expired extra food fresh
guest guests item items kitchen kilo kilos list low menu money order orders plate plates portion portions price
quantity rate report restaurant sale sales sell seller selling serve served shop staff stock store supplier
supply table week weekend wastage waste wasted inventory forecast demand prep prepare cook cooked revenue
profit loss popular summary yesterday tonight morning evening night lunch dinner breakfast
""".split())
