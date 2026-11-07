"""Reproducible stress checks for synthetic data; results are NOT estimates of field performance."""
from __future__ import annotations
import json
import random
from statistics import mean
from .experiment import classifier_experiment
from .data import make_transactions
from .antifraud import detect


def report(seeds=range(12)):
    seeds = list(seeds)
    if not seeds:
        raise ValueError("At least one seed is required")
    accuracies, fraud_original, fraud_masked = [], [], []
    for seed in seeds:
        accuracies.append(classifier_experiment(seed=seed, regime="unseen")["accuracy"])
        transactions, planted = make_transactions(seed=seed)
        k = len(planted)
        normal_top = {m for m, _ in detect(transactions, seed=seed)[:k]}
        fraud_original.append(len(normal_top & planted) / k)
        modified = [dict(t) for t in transactions]
        rng = random.Random(seed + 100000)
        for tx in modified:
            if tx["merchant"] in planted:
                tx["amount"] = round(rng.lognormvariate(7.0, 1.0), 2)
                tx["hour"] = min(23, max(6, int(rng.gauss(14, 3.5))))
        masked_top = {m for m, _ in detect(modified, seed=seed)[:k]}
        fraud_masked.append(len(masked_top & planted) / k)
    return {
        "mode": "synthetic_stress_test",
        "seeds": seeds,
        "classifier_unseen": {
            "accuracy_mean": round(mean(accuracies), 4),
            "accuracy_min": round(min(accuracies), 4),
            "accuracy_max": round(max(accuracies), 4),
        },
        "antifraud": {
            "precision_at_k_original_mean": round(mean(fraud_original), 4),
            "precision_at_k_masked_amounts_and_hours_mean": round(mean(fraud_masked), 4),
        },
        "warning": "Synthetic data; no claim about real users, fraud or actual payment security.",
    }


if __name__ == "__main__":
    print(json.dumps(report(), ensure_ascii=False, indent=2))
