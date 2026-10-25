"""Unit 3 - Slot tagging with a first-order Hidden Markov Model + Viterbi.

Hidden states are BIO slot tags (O, B-DISH, I-DISH, B-ING, ..., I-DATE);
observations are normalised words. Parameters are estimated by counting
over the hand-labelled training corpus (supervised MLE with add-k
smoothing):

    pi(t)       = P(t_1 = t)                 start probabilities
    A[t', t]    = P(t_i = t | t_{i-1} = t')  transition matrix
    B[t, o]     = P(o_i = o | t_i = t)       emission matrix

Unknown words are handled with *open-class symbols*: an unseen word is
replaced by its gazetteer / shape class (<D>, <I>, <NUM>, <DATE>, <UNK>, see
app.nlp.gazetteer). To learn emissions for those symbols the training
corpus is duplicated with every gazetteer/number/date word replaced by its
class, so the model knows that "<D> <D>" after "kitni" is probably B-DISH
I-DISH even for a dish it never saw, and once more with the name words
replaced by <UNK> ("unknown-name dropout", weight 0.2) so that a word the gazetteer
does not know either can still be tagged from its context.

Decoding is the Viterbi algorithm in log space:

    delta_1(t)   = log pi(t) + log B[t, o_1]
    delta_i(t)   = max_t' delta_{i-1}(t') + log A[t', t] + log B[t, o_i]
    psi_i(t)     = argmax_t' (...)          back-pointers

BIO well-formedness (I-X may only follow B-X or I-X) is enforced by setting
the illegal transitions to -inf. `viterbi` also returns the full trellis so
the report can draw it.
"""

from __future__ import annotations

from collections import Counter

import numpy as np

from app.nlp.corpus import TAGS
from app.nlp.gazetteer import Gazetteer

NEG_INF = -1e30


class HMMTagger:
    def __init__(self, k_trans: float = 0.1, k_emit: float = 0.01, dropout_weight: float = 0.2):
        self.dropout_weight = dropout_weight
        self.tags = list(TAGS)
        self.ti = {t: i for i, t in enumerate(self.tags)}
        self.k_trans, self.k_emit = k_trans, k_emit
        self.vocab: dict[str, int] = {}

    # ------------------------------------------------------------------ training
    def fit(self, sentences: list[tuple[list[str], list[str]]], gaz: Gazetteer) -> "HMMTagger":
        aug: list[tuple[list[str], list[str], float]] = []
        for words, tags in sentences:
            aug.append((words, tags, 1.0))
            cls = [gaz.word_class(w) for w in words]
            if any(c != "<UNK>" for c in cls):
                aug.append(([c if c != "<UNK>" else w for w, c in zip(words, cls)], tags, 1.0))
            if self.dropout_weight and any(t[2:] in ("DISH", "ING") for t in tags):
                # "unknown-name dropout": the same sentence with the dish /
                # ingredient words hidden, so <UNK> in a slot context
                # ("kitna ___ chahiye") can be tagged as a name.
                aug.append(([("<UNK>" if t[2:] in ("DISH", "ING") else w) for w, t in zip(words, tags)], tags,
                            self.dropout_weight))
        obs = Counter(w for words, _, _ in aug for w in words)
        self.vocab = {w: i for i, w in enumerate(sorted(obs))}
        for sym in ("<D>", "<I>", "<DI>", "<NUM>", "<DATE>", "<UNIT>", "<UNK>"):
            self.vocab.setdefault(sym, len(self.vocab))
        T, V = len(self.tags), len(self.vocab)
        start, trans, end = np.zeros(T), np.zeros((T, T)), np.zeros(T)
        emit = np.zeros((T, V))
        for words, tags, wt in aug:
            prev = None
            for w, t in zip(words, tags):
                j = self.ti[t]
                emit[j, self.vocab[w]] += wt
                if prev is None:
                    start[j] += wt
                else:
                    trans[prev, j] += wt
                prev = j
            if prev is not None:
                end[prev] += wt
        # Hapax trick: P(<UNK> | t) is estimated from words seen once with tag t,
        # i.e. how often tag t produces "new" words.
        freq = Counter(w for words, _ in sentences for w in words)
        for words, tags in sentences:
            for w, t in zip(words, tags):
                if freq[w] == 1:
                    emit[self.ti[t], self.vocab["<UNK>"]] += 1
        self.log_pi = np.log((start + self.k_trans) / (start.sum() + self.k_trans * T))
        self.log_A = np.log((trans + self.k_trans) / (trans.sum(1, keepdims=True) + self.k_trans * T))
        self.log_B = np.log((emit + self.k_emit) / (emit.sum(1, keepdims=True) + self.k_emit * V))
        # BIO constraints
        for j, t in enumerate(self.tags):
            if t.startswith("I-"):
                self.log_pi[j] = NEG_INF
                for i, p in enumerate(self.tags):
                    if p[2:] != t[2:]:
                        self.log_A[i, j] = NEG_INF
        self.gaz = gaz
        return self

    # ------------------------------------------------------------------ decoding
    def observe(self, words: list[str], gaz: Gazetteer | None = None) -> list[str]:
        g = gaz or self.gaz
        out = []
        for w in words:
            c = g.word_class(w)
            # words absent from training -> their class; class words of *this*
            # outlet's menu that training saw as plain words keep the word.
            out.append(w if w in self.vocab else c if c in self.vocab else "<UNK>")
        return out

    def viterbi(self, words: list[str], gaz: Gazetteer | None = None) -> dict:
        obs = self.observe(words, gaz)
        n, T = len(obs), len(self.tags)
        if n == 0:
            return {"tags": [], "obs": [], "delta": np.zeros((0, T)), "psi": np.zeros((0, T), int), "logp": 0.0}
        o = [self.vocab[x] for x in obs]
        delta = np.full((n, T), NEG_INF)
        psi = np.zeros((n, T), dtype=int)
        delta[0] = self.log_pi + self.log_B[:, o[0]]
        for i in range(1, n):
            scores = delta[i - 1][:, None] + self.log_A          # (prev, cur)
            psi[i] = scores.argmax(0)
            delta[i] = scores.max(0) + self.log_B[:, o[i]]
        path = [int(delta[-1].argmax())]
        for i in range(n - 1, 0, -1):
            path.append(int(psi[i, path[-1]]))
        path.reverse()
        return {"tags": [self.tags[j] for j in path], "obs": obs, "delta": delta, "psi": psi,
                "logp": float(delta[-1].max())}

    def tag(self, words: list[str], gaz: Gazetteer | None = None) -> list[str]:
        return self.viterbi(words, gaz)["tags"]


def rule_tags(words: list[str], gaz: Gazetteer) -> list[str]:
    """Rule baseline: gazetteer longest match + the quantity/date DFA."""
    from app.nlp.fsa import scan

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
    return tags
