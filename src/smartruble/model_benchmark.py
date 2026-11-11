"""Reproducible comparison of item-text classifiers on held-out product names.

The evaluation uses ONLY the project's synthetic examples. It holds out
entire base product names using split_by_base, preventing paraphrases of the
same product leaking into both train and test. Results are NOT estimates of
real-world financial decision accuracy and must not be used as risk guarantees.

Run: PYTHONPATH=src python -m smartruble.model_benchmark --seeds 0 1 2
"""
from __future__ import annotations

import argparse
import json
from statistics import mean

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, make_pipeline

from .classifier import ItemClassifier
from .data import make_items, split_by_base


def candidate(name: str):
    """Identical classifier head; only the text representation changes."""
    if name == "current_char":
        return ItemClassifier()
    if name == "char_longer":
        return make_pipeline(
            TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 6),
                            lowercase=True, sublinear_tf=True),
            LogisticRegression(max_iter=1000, C=8.0),
        )
    if name == "hybrid_char_word":
        features = FeatureUnion([
            ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5),
                                      lowercase=True, sublinear_tf=True)),
            ("words", TfidfVectorizer(analyzer="word", ngram_range=(1, 2),
                                      token_pattern=r"(?u)\b\w+\b", lowercase=True,
                                      sublinear_tf=True)),
        ])
        return make_pipeline(features, LogisticRegression(max_iter=1000, C=8.0))
    raise ValueError(f"Unknown candidate: {name}")


CANDIDATES = ("current_char", "char_longer", "hybrid_char_word")


def decision_metrics(y_true, predicted, confidence, *, approve_threshold=0.8, reject_threshold=0.6):
    """Simulated selective-decision metrics with all four budget categories present.

    'other' is the only excluded target; actual financial contract decisions
    also check limits and categories and can defer to a person.
    """
    y = np.asarray(y_true)
    p = np.asarray(predicted)
    c = np.asarray(confidence, dtype=float)
    if not (len(y) == len(p) == len(c)) or not len(y):
        raise ValueError("Equal nonempty label and confidence arrays are required")
    if not np.all(np.isfinite(c)) or np.any(c < 0) or np.any(c > 1):
        raise ValueError("Confidences must be finite values in [0,1]")
    actual_other = y == "other"
    actual_allowed = ~actual_other
    auto_approve = (p != "other") & (c >= approve_threshold)
    auto_reject = (p == "other") & (c >= reject_threshold)
    def safe_fraction(num, den):
        return round(float(num) / float(den), 4) if den else None
    return {
        "accuracy": safe_fraction(int(np.sum(y == p)), len(y)),
        "auto_decision_coverage": safe_fraction(int(np.sum(auto_approve | auto_reject)), len(y)),
        "auto_approved_share": safe_fraction(int(np.sum(auto_approve)), len(y)),
        "false_approve_rate_other": safe_fraction(
            int(np.sum(auto_approve & actual_other)), int(np.sum(actual_other))),
        "false_reject_rate_allowed": safe_fraction(
            int(np.sum(auto_reject & actual_allowed)), int(np.sum(actual_allowed))),
        "n_test": len(y),
        "n_other": int(np.sum(actual_other)),
    }


def run(seeds=(0, 1, 2), *, n_per_class=240):
    seeds = list(seeds)
    if not seeds or len(set(seeds)) != len(seeds):
        raise ValueError("Use one or more distinct seeds")
    raw = {key: [] for key in CANDIDATES}
    for seed in seeds:
        rows = make_items(n_per_class=n_per_class, seed=seed)
        train, test = split_by_base(rows, test_share=0.3, seed=seed)
        train_base = {row[2] for row in train}
        test_base = {row[2] for row in test}
        assert not (train_base & test_base), "Base product leakage detected"
        names = [r[0] for r in train]
        labels = [r[1] for r in train]
        test_names = [r[0] for r in test]
        targets = [r[1] for r in test]
        for name in CANDIDATES:
            model = candidate(name)
            model.fit(names, labels)
            if name == "current_char":
                predictions = model.predict_many(test_names)
            else:
                prob = model.predict_proba(test_names)
                classes = model.classes_
                predictions = [(classes[int(p.argmax())], float(p.max())) for p in prob]
            predicted, confidence = zip(*predictions)
            metrics = decision_metrics(targets, predicted, confidence)
            metrics["seed"] = seed
            raw[name].append(metrics)
    summary = {}
    fields = ("accuracy", "auto_decision_coverage", "auto_approved_share",
              "false_approve_rate_other", "false_reject_rate_allowed")
    for name, trials in raw.items():
        averages = {key: round(mean(t[key] for t in trials if t[key] is not None), 4)
                    for key in fields}
        summary[name] = {
            "mean": averages,
            "max_false_approve_rate_other": max(t["false_approve_rate_other"] for t in trials),
            "min_accuracy": min(t["accuracy"] for t in trials),
            "runs": trials,
        }
    return {
        "mode": "synthetic_held_out_base_comparison",
        "seeds": seeds,
        "assumed_thresholds": {"approval": 0.8, "rejection": 0.6},
        "candidates": summary,
        "interpretation": "Exploratory: probability scores are not calibrated across variants.",
        "warning": "Synthetic examples only; no claims of real-world classification safety or bank integration.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seeds", nargs="+", type=int, default=[0, 1, 2])
    parser.add_argument("--samples-per-class", type=int, default=240)
    args = parser.parse_args()
    if not (40 <= args.samples_per_class <= 2000):
        parser.error("samples-per-class must be 40..2000")
    print(json.dumps(run(args.seeds, n_per_class=args.samples_per_class),
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
