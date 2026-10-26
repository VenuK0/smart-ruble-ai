"""Эксперимент на синтетических данных: метрики для презентации. Запуск: python -m smartruble (из папки src)."""
from __future__ import annotations
import json, os
import numpy as np
from .data import make_items, split_by_base, make_transactions, ALLOWED
from .classifier import ItemClassifier
from . import antifraud


def classifier_experiment(seed=0, regime="known"):
    """regime='known' — известные типы товаров, новые формулировки; 'unseen' — типы товаров, которых модель не видела."""
    rows = make_items(300, seed)
    if regime == "unseen":
        train, test = split_by_base(rows, 0.3, seed)
    else:
        cut = int(len(rows) * 0.7)
        train, test = rows[:cut], rows[cut:]
    clf = ItemClassifier().fit([r[0] for r in train], [r[1] for r in train])
    preds = clf.predict_many([r[0] for r in test])
    y = np.array([r[1] for r in test]); p = np.array([a for a, _ in preds]); c = np.array([b for _, b in preds])
    acc = float((y == p).mean())
    # «опасная ошибка»: нецелевая позиция принята за целевую
    leak = float(((y == "other") & (p != "other")).sum() / max(1, (y == "other").sum()))
    sweep = []
    for t in [0.0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        m = c >= t
        bad = m & (y == "other") & (p != "other")          # нецелевая позиция автоматически одобрена как целевая
        sweep.append({"threshold": t, "auto_share": float(m.mean()),
                      "auto_accuracy": float((y[m] == p[m]).mean()) if m.any() else None,
                      "false_approve_rate": float(bad.sum() / max(1, (y == "other").sum()))})
    return {"regime": regime, "n_train": len(train), "n_test": len(test), "accuracy": acc, "other_as_target_rate": leak, "sweep": sweep}


def fraud_experiment(seeds=range(20)):
    prec, rec, hit = [], [], []
    for s in seeds:
        tx, fraud = make_transactions(seed=s)
        ranked = antifraud.detect(tx, seed=s)
        k = len(fraud)
        top = {m for m, _ in ranked[:k]}
        tp = len(top & fraud)
        prec.append(tp / k); rec.append(tp / len(fraud))
        flagged = {m for m, _ in ranked[:k + 2]}
        hit.append(len(flagged & fraud) / len(fraud))
    return {"runs": len(list(seeds)), "precision_at_k": float(np.mean(prec)), "recall_at_k_plus2": float(np.mean(hit))}


def make_chart(res, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    sw = res["classifier_unseen"]["sweep"]
    x = [s["threshold"] for s in sw]
    fig, ax = plt.subplots(figsize=(6.4, 3.6), dpi=200)
    ax.plot(x, [s["false_approve_rate"] * 100 for s in sw], marker="o", color="#B91C1C",
            label="Нецелевые позиции, ошибочно одобренные автоматически, %")
    ax.plot(x, [s["auto_share"] * 100 for s in sw], marker="s", color="#1E3A8A",
            label="Доля позиций, решённых без человека, %")
    ax.set_xlabel("Порог уверенности классификатора"); ax.set_ylim(0, 105)
    ax.grid(alpha=.25); ax.legend(loc="upper right", fontsize=7.5, frameon=False)
    for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


def main(out_dir="."):
    res = {"classifier_known": classifier_experiment(regime="known"),
           "classifier_unseen": classifier_experiment(regime="unseen"), "antifraud": fraud_experiment()}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    make_chart(res, os.path.join(out_dir, "threshold_tradeoff.png"))
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
