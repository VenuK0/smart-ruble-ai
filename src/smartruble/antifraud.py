"""Антифрод: признаки мерчантов из графа «студент — мерчант» + Isolation Forest."""
from __future__ import annotations
from collections import defaultdict
import networkx as nx
import numpy as np
from sklearn.ensemble import IsolationForest

FEATURES = ["n_tx", "n_students", "top_student_share", "round_share", "night_share", "mean_amount"]


def merchant_features(transactions):
    g = nx.Graph()
    per_m = defaultdict(list)
    for t in transactions:
        g.add_edge(("s", t["student"]), ("m", t["merchant"]))
        per_m[t["merchant"]].append(t)
    rows, ids = [], []
    for mid, txs in per_m.items():
        n = len(txs)
        by_student = defaultdict(int)
        for t in txs:
            by_student[t["student"]] += 1
        rows.append([
            n,
            g.degree(("m", mid)),                                   # число разных студентов в графе
            max(by_student.values()) / n,                           # концентрация на одном студенте
            sum(1 for t in txs if t["amount"] >= 10000 and t["amount"] % 1000 == 0) / n,  # круглые крупные суммы
            sum(1 for t in txs if t["hour"] < 6 or t["hour"] >= 22) / n,                   # ночные операции
            float(np.mean([t["amount"] for t in txs])),
        ])
        ids.append(mid)
    return ids, np.array(rows, dtype=float)


def detect(transactions, contamination: float = 0.08, seed: int = 0):
    """Возвращает отсортированный по риску список (мерчант, оценка аномальности; больше — подозрительнее)."""
    ids, X = merchant_features(transactions)
    mu, sd = X.mean(axis=0), X.std(axis=0) + 1e-9
    model = IsolationForest(n_estimators=200, contamination=contamination, random_state=seed).fit((X - mu) / sd)
    score = -model.score_samples((X - mu) / sd)
    return sorted(zip(ids, score), key=lambda p: -p[1])
