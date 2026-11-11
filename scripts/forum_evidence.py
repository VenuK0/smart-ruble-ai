"""Synthetic SmartRubleAI forum evidence; NOT real financial or pilot measurements.
Run: .venv\Scripts\python.exe scripts\forum_evidence.py
All manual actions here are scripted and all data is synthetic.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from smartruble.antifraud import detect
from smartruble.classifier import ItemClassifier
from smartruble.contract import SmartContract, APPROVE, REVIEW, REJECT
from smartruble.data import ALLOWED, make_items, make_transactions, split_by_base


def rate(n, d):
    return round(n / d, 5) if d else None


def classifier_trial(seed, sample_size=160):
    """Hold out entire base product names; apply actual 0.80/0.60 decision gates."""
    rows = make_items(n_per_class=sample_size, seed=seed)
    train, test = split_by_base(rows, test_share=0.3, seed=seed)
    assert not ({r[2] for r in train} & {r[2] for r in test}), "Product-base leakage"
    model = ItemClassifier().fit([r[0] for r in train], [r[1] for r in train])
    preds = model.predict_many([r[0] for r in test])
    actual = [r[1] for r in test]
    approved = [p in ALLOWED and conf >= 0.8 for p, conf in preds]
    rejected = [p == "other" and conf >= 0.6 for p, conf in preds]
    n_other = sum(y == "other" for y in actual)
    n_correct = sum(y == p for y, (p, _) in zip(actual, preds))
    dangerous = sum(y == "other" and a for y, a in zip(actual, approved))
    wrongly_rejected = sum(y != "other" and r for y, r in zip(actual, rejected))
    decided = sum(approved) + sum(rejected)
    return {
        "seed": seed, "n_train": len(train), "n_test": len(test),
        "n_other": n_other, "n_allowed": len(test) - n_other,
        "correct": n_correct, "auto_approved": sum(approved),
        "auto_rejected": sum(rejected), "manual_review": len(test) - decided,
        "dangerous_approvals": dangerous, "wrong_rejections": wrongly_rejected,
        "accuracy": rate(n_correct, len(test)),
        "auto_coverage": rate(decided, len(test)),
        "dangerous_rate_other": rate(dangerous, n_other),
        "wrong_rejection_rate_allowed": rate(wrongly_rejected, len(test) - n_other),
    }


def classification(seeds, sample_size):
    trials = [classifier_trial(seed, sample_size) for seed in seeds]
    fields = ["n_train", "n_test", "n_other", "n_allowed", "correct",
              "auto_approved", "auto_rejected", "manual_review",
              "dangerous_approvals", "wrong_rejections"]
    total = {key: sum(row[key] for row in trials) for key in fields}
    return {
        "method": "synthetic disjoint base product names; all eligible budget categories assumed present",
        "approval_threshold": 0.8, "reject_other_threshold": 0.6,
        "samples_per_class": sample_size, "seeds": seeds,
        "per_seed": trials, "totals": total,
        "micro_rates": {
            "accuracy": rate(total["correct"], total["n_test"]),
            "auto_coverage": rate(total["auto_approved"] + total["auto_rejected"], total["n_test"]),
            "dangerous_rate_other": rate(total["dangerous_approvals"], total["n_other"]),
            "wrong_rejection_rate_allowed": rate(total["wrong_rejections"], total["n_allowed"]),
        },
    }


def antifraud_trial(seed):
    tx, planted = make_transactions(seed=seed)
    k = len(planted)
    assert k > 0
    ranking = detect(tx, seed=seed)
    first_k = {merchant for merchant, _ in ranking[:k]}
    first_plus = {merchant for merchant, _ in ranking[:k + 2]}
    masked = [dict(x) for x in tx]
    rng = random.Random(seed + 100000)
    for row in masked:
        if row["merchant"] in planted:
            row["amount"] = round(rng.lognormvariate(7.0, 1.0), 2)
            row["hour"] = min(23, max(6, int(rng.gauss(14, 3.5))))
    hidden_ranked = detect(masked, seed=seed)
    hidden_k = {merchant for merchant, _ in hidden_ranked[:k]}
    found_k = len(first_k & planted)
    found_plus = len(first_plus & planted)
    found_hidden = len(hidden_k & planted)
    return {
        "seed": seed, "transactions": len(tx), "merchants": len(ranking),
        "planted": k, "found_top_k": found_k, "false_alerts_top_k": k - found_k,
        "found_top_k_plus_2": found_plus, "false_alerts_top_k_plus_2": k + 2 - found_plus,
        "found_top_k_masked": found_hidden, "precision_at_k": rate(found_k, k),
        "recall_at_k_plus_2": rate(found_plus, k),
        "masked_recall_at_k": rate(found_hidden, k),
    }


def antifraud(seeds):
    trials = [antifraud_trial(seed) for seed in seeds]
    planted = sum(x["planted"] for x in trials)
    found_k = sum(x["found_top_k"] for x in trials)
    found_plus = sum(x["found_top_k_plus_2"] for x in trials)
    found_masked = sum(x["found_top_k_masked"] for x in trials)
    false_plus = sum(x["false_alerts_top_k_plus_2"] for x in trials)
    return {
        "method": "synthetic planted merchant patterns; altered amounts/hours in masked stress test",
        "seeds": seeds, "per_seed": trials,
        "totals": {"transactions_across_runs": sum(x["transactions"] for x in trials),
                   "planted_across_runs": planted, "found_top_k": found_k,
                   "found_top_k_plus_2": found_plus,
                   "false_alerts_top_k_plus_2": false_plus,
                   "found_top_k_masked": found_masked},
        "micro_rates": {"precision_at_k": rate(found_k, planted),
                        "recall_at_k_plus_2": rate(found_plus, planted),
                        "false_alert_share_top_k_plus_2": rate(
                            false_plus, sum(x["planted"] + 2 for x in trials)),
                        "masked_recall_at_k": rate(found_masked, planted)},
    }


class ScriptedClassifier:
    """Deterministic stand-in for contract-transition tests, NOT evaluated ML."""
    def predict_one(self, name):
        return {
            "печать": ("services", 0.99),
            "неясный товар 1": ("other", 0.35),
            "неясный товар 2": ("other", 0.35),
            "личный товар": ("other", 0.95),
        }[name]


def review_workflow():
    c = SmartContract(limits={"services": 300}, classifier=ScriptedClassifier())
    first_input = {"id": "forum-r1", "merchant": "Учебный магазин",
                   "items": [{"name": "печать", "price": 75},
                             {"name": "неясный товар 1", "price": 125},
                             {"name": "личный товар", "price": 50}]}
    second_input = {"id": "forum-r2", "merchant": "Учебный магазин",
                    "items": [{"name": "неясный товар 2", "price": 200}]}
    first = c.validate(first_input)
    second = c.validate(second_input)
    assert [x["decision"] for x in first["items"]] == [APPROVE, REVIEW, REJECT]
    assert second["items"][0]["decision"] == REVIEW
    assert c.remaining("services") == 225
    assert len(c.list_reviews()) == 2
    c.resolve_review("forum-r1", 1, "APPROVE", "services", "Учебное согласование")
    assert c.remaining("services") == 100
    overspend_blocked = False
    try:
        c.resolve_review("forum-r2", 0, "APPROVE", "services", "Превышает остаток")
    except ValueError as exc:
        overspend_blocked = "Недостаточно средств" in str(exc)
    assert overspend_blocked
    c.resolve_review("forum-r2", 0, "REJECT", None, "Недостаточный лимит")
    assert c.remaining("services") == 100
    assert c.validate(first_input) == first
    duplicate = c.resolve_review("forum-r1", 1, "APPROVE", "services", "Учебное согласование")
    assert duplicate["status"] == "APPROVED" and c.remaining("services") == 100
    assert len(c.log) == 4 and c.verify_log()
    immutable = (c.processed_receipts["forum-r1"][1] == first
                 and c.processed_receipts["forum-r2"][1] == second)
    assert immutable
    return {
        "method": "real SmartContract, deterministic scripted ML predictions and reviewer decisions",
        "initial_budget_rub": 300, "receipt_count": 2, "items": 4,
        "auto_approved_items": 1, "auto_rejected_items": 1,
        "review_items": 2, "review_approved_items": 1, "review_rejected_items": 1,
        "overspend_blocked": overspend_blocked,
        "duplicate_receipt_unchanged": c.validate(first_input) == first,
        "duplicate_decision_unchanged": duplicate["status"] == "APPROVED",
        "final_spent_rub": c.spent["services"], "remaining_rub": c.remaining("services"),
        "hash_chain_valid": c.verify_log(), "original_receipts_immutable": immutable,
        "audit_entries": len(c.log),
        "review_statuses": [x["status"] for x in c.list_reviews()],
    }


def collect(classifier_seeds, fraud_seeds, sample_size):
    if not classifier_seeds or not fraud_seeds:
        raise ValueError("Both seed lists are required")
    if len(set(classifier_seeds)) != len(classifier_seeds):
        raise ValueError("Classifier seeds must be distinct")
    if len(set(fraud_seeds)) != len(fraud_seeds):
        raise ValueError("Fraud seeds must be distinct")
    if not 40 <= sample_size <= 2000:
        raise ValueError("Sample size must be 40..2000")
    return {
        "schema": "forum-evidence-v1", "kind": "synthetic_only",
        "classifier": classification(classifier_seeds, sample_size),
        "antifraud": antifraud(fraud_seeds),
        "manual_review": review_workflow(),
        "limitations": {
            "real_financial_payments": False,
            "pilot_data": False,
            "measured_human_time": False,
            "measured_ruble_savings": False,
        },
    }


def percentage(value):
    return "не определено" if value is None else f"{100 * value:.2f}%".replace(".", ",")


def summary(report):
    c, a, h = report["classifier"], report["antifraud"], report["manual_review"]
    mc, ma = c["micro_rates"], a["micro_rates"]
    return "\n".join([
        "# SmartRubleAI: воспроизводимые экспериментальные результаты",
        "",
        "**СИНТЕТИКА, НЕ ПИЛОТ.** Нет реальных платежей и фактически измеренной экономии.",
        "",
        "## Классификация новых типов товаров",
        f"- Запусков: {len(c['seeds'])}; тестовых позиций: {c['totals']['n_test']}.",
        f"- Точность: {percentage(mc['accuracy'])}.",
        f"- Доля автоматически решённых позиций: {percentage(mc['auto_coverage'])}.",
        f"- Опасные одобрения: {c['totals']['dangerous_approvals']} из "
        f"{c['totals']['n_other']} нецелевых ({percentage(mc['dangerous_rate_other'])}).",
        f"- Ошибочные автоотказы: {c['totals']['wrong_rejections']} из "
        f"{c['totals']['n_allowed']} целевых ({percentage(mc['wrong_rejection_rate_allowed'])}).",
        "- Все целевые категории условно включены в смету с достаточным остатком.",
        "",
        "## Поиск аномалий",
        f"- Запусков: {len(a['seeds'])}; заложенных сценариев: "
        f"{a['totals']['planted_across_runs']}.",
        f"- Точность top-k: {percentage(ma['precision_at_k'])}.",
        f"- Полнота top-(k+2): {percentage(ma['recall_at_k_plus_2'])}.",
        f"- Ложных сигналов в top-(k+2): {a['totals']['false_alerts_top_k_plus_2']} "
        f"({percentage(ma['false_alert_share_top_k_plus_2'])} показанных).",
        f"- Полнота top-k после маскировки сумм/времени: "
        f"{percentage(ma['masked_recall_at_k'])}.",
        "- Заложенные сценарии известны генератору; это не оценка реального мошенничества.",
        "",
        "## Ручное согласование: проверка инвариантов",
        f"- Чеков: {h['receipt_count']}, позиций: {h['items']}, спорных: {h['review_items']}.",
        f"- Начальный лимит: {h['initial_budget_rub']} ₽; учтено: "
        f"{h['final_spent_rub']} ₽; остаток: {h['remaining_rub']} ₽.",
        f"- Превышение заблокировано: {h['overspend_blocked']}; "
        f"повтор не списывает дважды: {h['duplicate_decision_unchanged']}.",
        f"- Цепочка проверена: {h['hash_chain_valid']}; "
        f"исходные чеки не изменены: {h['original_receipts_immutable']}.",
        "- Использован заранее заданный классификатор для тестирования бизнес-логики, "
        "не для измерения качества ML.",
        "",
        "## Ограничения и воспроизводимость",
        "- Тестовые названия базовых товаров не пересекаются с обучением.",
        "- Все доли рассчитаны по суммарным числителям и знаменателям.",
        "- Скорость ручного труда, экономия, реальные риски и эффект внедрения не измерены.",
        "- Зафиксируйте версию Python и библиотек при повторении; исходные данные "
        "и seed сохранены в JSON и CSV.",
        "- Сверка SHA-256 в manifest.sha256.json выявляет изменения выгрузки.",
        "",
    ]) + "\n"


def write_bundle(report, directory):
    directory.mkdir(parents=True, exist_ok=True)
    from io import StringIO
    def make_csv(rows):
        stream = StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), delimiter=";",
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        return stream.getvalue()
    files = {
        "results.json": json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        "classifier_seeds.csv": make_csv(report["classifier"]["per_seed"]),
        "antifraud_seeds.csv": make_csv(report["antifraud"]["per_seed"]),
        "SUMMARY.md": summary(report),
    }
    checksums = {}
    for filename, contents in files.items():
        raw = contents.encode("utf-8")
        (directory / filename).write_bytes(raw)
        checksums[filename] = hashlib.sha256(raw).hexdigest()
    (directory / "manifest.sha256.json").write_text(
        json.dumps(checksums, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return checksums


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classifier-seeds", nargs="+", type=int, default=[0, 1, 2, 3, 4])
    parser.add_argument("--fraud-seeds", nargs="+", type=int, default=list(range(10)))
    parser.add_argument("--samples-per-class", type=int, default=160)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "forum-evidence")
    args = parser.parse_args()
    report = collect(args.classifier_seeds, args.fraud_seeds, args.samples_per_class)
    write_bundle(report, args.output)
    print(summary(report))
    print("FORUM EVIDENCE PASS: synthetic classifier, anomaly and review tests")


if __name__ == "__main__":
    main()
