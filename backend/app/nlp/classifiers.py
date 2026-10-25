"""Unit 4/5 - Intent classifiers written from scratch, and baselines.

All classifiers take a list of feature strings per question (see
app.nlp.features) and return a probability per intent.

* MaxEntClassifier multinomial logistic regression, gradient descent       (Unit 3/4)
* MultinomialNB    (Boolean) Naive Bayes with add-alpha smoothing:
                   argmax_c log P(c) + sum_f log P(f | c)          (Unit 4)
* TfidfVectorizer  tf = 1 + log(count), idf = log((1+N)/(1+df)) + 1, L2 norm
* CentroidClassifier  cosine similarity to each intent's mean TF-IDF vector
                      (Rocchio / nearest prototype)                    (Unit 5)
* KNNClassifier    cosine k-nearest neighbours with similarity-weighted votes
* EmbeddingCentroid  mean PPMI-SVD vector of the question vs intent centroids
* Ensemble         average of the members' probability vectors

`regex_intent` re-implements the original rule cascade of
frontend/src/lib/assistant/offline.ts so it can be scored as a baseline.
The scikit-learn LogisticRegression baseline lives in app.nlp.report (only
as a comparison, never at runtime).
"""

from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np


def softmax(x: np.ndarray, temp: float = 1.0) -> np.ndarray:
    z = (x - x.max()) / temp
    e = np.exp(z)
    return e / e.sum()


class MultinomialNB:
    def __init__(self, alpha: float = 0.5, binary: bool = True):
        self.alpha, self.binary = alpha, binary

    def fit(self, docs: list[list[str]], labels: list[str]) -> "MultinomialNB":
        if self.binary:  # Boolean multinomial NB: a feature counts once per document
            docs = [list(dict.fromkeys(d)) for d in docs]
        self.classes = sorted(set(labels))
        self.vocab = sorted({f for d in docs for f in d})
        self.counts = {c: Counter() for c in self.classes}
        for d, y in zip(docs, labels):
            self.counts[y].update(d)
        n = len(labels)
        self.log_prior = {c: math.log(labels.count(c) / n) for c in self.classes}
        V = len(self.vocab)
        self.denom = {c: sum(self.counts[c].values()) + self.alpha * V for c in self.classes}
        self.vocab_set = set(self.vocab)
        return self

    def log_scores(self, doc: list[str]) -> dict[str, float]:
        if self.binary:
            doc = list(dict.fromkeys(doc))
        out = {}
        for c in self.classes:
            s = self.log_prior[c]
            for f in doc:
                if f in self.vocab_set:  # unseen features carry no evidence
                    s += math.log((self.counts[c][f] + self.alpha) / self.denom[c])
            out[c] = s
        return out

    def predict_proba(self, doc: list[str]) -> dict[str, float]:
        ls = self.log_scores(doc)
        p = softmax(np.array([ls[c] for c in self.classes]))
        return dict(zip(self.classes, p.tolist()))


class MaxEntClassifier:
    """Multinomial logistic regression (maximum entropy), trained from scratch.

    P(c | x) = exp(w_c . x + b_c) / sum_c' exp(w_c' . x + b_c')
    Loss = mean cross-entropy + (l2 / 2) * ||W||^2, minimised by full-batch
    gradient descent with Nesterov momentum on the TF-IDF vectors.
    """

    def __init__(self, l2: float = 1e-3, lr: float = 2.0, epochs: int = 300):
        self.l2, self.lr, self.epochs = l2, lr, epochs

    def fit(self, X: np.ndarray, labels: list[str]) -> "MaxEntClassifier":
        self.classes = sorted(set(labels))
        y = np.array([self.classes.index(c) for c in labels])
        n, d = X.shape
        K = len(self.classes)
        Y = np.eye(K)[y]
        W, b = np.zeros((d, K)), np.zeros(K)
        vW, vb = np.zeros_like(W), np.zeros_like(b)
        mu = 0.9
        for _ in range(self.epochs):
            Wn, bn = W + mu * vW, b + mu * vb      # Nesterov look-ahead
            Z = X @ Wn + bn
            Z -= Z.max(1, keepdims=True)
            P = np.exp(Z)
            P /= P.sum(1, keepdims=True)
            G = (P - Y) / n
            gW = X.T @ G + self.l2 * Wn
            gb = G.sum(0)
            vW = mu * vW - self.lr * gW
            vb = mu * vb - self.lr * gb
            W, b = W + vW, b + vb
        self.W, self.b = W.astype(np.float32), b.astype(np.float32)
        return self

    def predict_proba(self, x: np.ndarray) -> dict[str, float]:
        return dict(zip(self.classes, softmax(x @ self.W + self.b).tolist()))


class TfidfVectorizer:
    def fit(self, docs: list[list[str]]) -> "TfidfVectorizer":
        df = Counter(f for d in docs for f in set(d))
        self.vocab = {f: i for i, f in enumerate(sorted(df))}
        N = len(docs)
        self.idf = np.array([math.log((1 + N) / (1 + df[f])) + 1 for f in sorted(df)], dtype=np.float32)
        return self

    def transform_one(self, doc: list[str]) -> np.ndarray:
        v = np.zeros(len(self.vocab), dtype=np.float32)
        for f, c in Counter(doc).items():
            i = self.vocab.get(f)
            if i is not None:
                v[i] = (1 + math.log(c)) * self.idf[i]
        n = np.linalg.norm(v)
        return v / n if n else v

    def transform(self, docs: list[list[str]]) -> np.ndarray:
        return np.vstack([self.transform_one(d) for d in docs]) if docs else np.zeros((0, len(self.vocab)))


class CentroidClassifier:
    """Nearest intent prototype by cosine similarity of TF-IDF vectors."""

    def __init__(self, temp: float = 0.05):
        self.temp = temp

    def fit(self, X: np.ndarray, labels: list[str]) -> "CentroidClassifier":
        self.classes = sorted(set(labels))
        y = np.array(labels)
        C = np.vstack([X[y == c].mean(0) for c in self.classes])
        self.C = C / np.maximum(np.linalg.norm(C, axis=1, keepdims=True), 1e-9)
        return self

    def predict_proba(self, x: np.ndarray) -> dict[str, float]:
        sims = self.C @ x
        return dict(zip(self.classes, softmax(sims, self.temp).tolist()))


class KNNClassifier:
    def __init__(self, k: int = 5):
        self.k = k

    def fit(self, X: np.ndarray, labels: list[str]) -> "KNNClassifier":
        self.X, self.y = X, list(labels)
        self.classes = sorted(set(labels))
        return self

    def predict_proba(self, x: np.ndarray) -> dict[str, float]:
        sims = self.X @ x
        idx = np.argsort(-sims)[: self.k]
        votes = {c: 1e-3 for c in self.classes}
        for i in idx:
            votes[self.y[i]] += max(float(sims[i]), 0.0)
        tot = sum(votes.values())
        return {c: v / tot for c, v in votes.items()}


class EmbeddingCentroid:
    def __init__(self, emb, temp: float = 0.05):
        self.emb, self.temp = emb, temp

    def doc_vec(self, words: list[str]) -> np.ndarray:
        vs = [v for w in words if (v := self.emb.vec(w)) is not None]
        if not vs:
            return np.zeros(self.emb.W.shape[1], dtype=np.float32)
        v = np.mean(vs, axis=0)
        n = np.linalg.norm(v)
        return v / n if n else v

    def fit(self, docs: list[list[str]], labels: list[str]) -> "EmbeddingCentroid":
        self.classes = sorted(set(labels))
        X = np.vstack([self.doc_vec(d) for d in docs])
        y = np.array(labels)
        C = np.vstack([X[y == c].mean(0) for c in self.classes])
        self.C = C / np.maximum(np.linalg.norm(C, axis=1, keepdims=True), 1e-9)
        return self

    def predict_proba(self, words: list[str]) -> dict[str, float]:
        return dict(zip(self.classes, softmax(self.C @ self.doc_vec(words), self.temp).tolist()))


def average(probas: list[dict[str, float]], weights: list[float] | None = None) -> dict[str, float]:
    weights = weights or [1.0] * len(probas)
    keys = probas[0].keys()
    tot = sum(weights)
    return {k: sum(w * p[k] for w, p in zip(weights, probas)) / tot for k in keys}


# --------------------------------------------------------------------------- regex baseline
_PURCHASE_NAME = re.compile(r"(?:order|buy|purchase|of)\s+(?:some\s+)?([a-z][a-z ]{2,30}?)(?:\s+for|\s+this|\s+next|\?|$)")


def regex_intent(question: str) -> str:
    """Python port of the rule cascade in offline.ts. 'fallback' = the help text."""
    lower = question.strip().lower()
    if re.search(r"\b(order|buy|purchase|stock up)\b", lower) and _PURCHASE_NAME.search(lower):
        return "purchase"
    if re.search(r"\bwaste|wasted|throw|leftover", lower):
        return "waste"
    if re.search(r"\bforecast|expect|predict|demand|how many .* (sell|tomorrow)", lower):
        return "forecast"
    if re.search(r"\bprep|plan|cook\b", lower):
        return "prep"
    if re.search(r"\bstock|inventory|left|have\b.*\b(kg|litre|pieces)|expir", lower):
        return "stock"
    if re.search(r"\bsales|sold|revenue|best.?sell|popular|earn", lower):
        return "sales"
    return "fallback"


def answer_category(intent: str) -> str:
    """help and unknown both get the help text, so they are one answer category."""
    return "fallback" if intent in ("help", "unknown", "fallback") else intent
