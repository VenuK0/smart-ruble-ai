"""Шаблон смарт-контракта целевых средств (симуляция логики; не исполняется на платформе ЦБ).

Решение по каждой позиции: APPROVE / REVIEW / REJECT. Неуверенные случаи и статьи вне сметы уходят на ручную проверку
(человек в контуре), а не блокируются автоматически. Аудиторский след — журнал с цепочкой хэшей.
"""
from __future__ import annotations
import hashlib, json, time
from dataclasses import dataclass, field

APPROVE, REVIEW, REJECT = "APPROVE", "REVIEW", "REJECT"


@dataclass
class SmartContract:
    limits: dict                      # {категория: лимит, ₽}
    classifier: object                # объект с predict_one(name) -> (категория, уверенность)
    t_high: float = 0.80              # порог автоодобрения
    t_reject: float = 0.60            # порог автоотказа для нецелевых позиций
    spent: dict = field(default_factory=dict)
    log: list = field(default_factory=list)

    def remaining(self, cat: str) -> float:
        return self.limits.get(cat, 0.0) - self.spent.get(cat, 0.0)

    def _item_decision(self, name: str, amount: float):
        cat, conf = self.classifier.predict_one(name)
        if cat == "other":
            if conf >= self.t_reject:
                return REJECT, cat, conf, "позиция не относится к целям средств"
            return REVIEW, cat, conf, "низкая уверенность классификатора"
        if cat not in self.limits:
            return REVIEW, cat, conf, "статья не предусмотрена сметой — решает человек"
        if conf < self.t_high:
            return REVIEW, cat, conf, "низкая уверенность классификатора"
        if amount > self.remaining(cat) + 1e-9:
            return REJECT, cat, conf, "превышен лимит статьи"
        return APPROVE, cat, conf, "соответствует статье сметы"

    def validate(self, receipt: dict, commit: bool = True) -> dict:
        """receipt = {'id','merchant','items':[{'name','qty','price'}]}"""
        items_out, sums = [], {APPROVE: 0.0, REVIEW: 0.0, REJECT: 0.0}
        for it in receipt["items"]:
            amount = float(it["price"]) * float(it.get("qty", 1))
            dec, cat, conf, why = self._item_decision(it["name"], amount)
            if dec == APPROVE and commit:
                self.spent[cat] = self.spent.get(cat, 0.0) + amount
            sums[dec] += amount
            items_out.append({"name": it["name"], "amount": amount, "decision": dec, "category": cat,
                              "confidence": round(conf, 3), "reason": why})
        if sums[REJECT] == 0 and sums[REVIEW] == 0:
            status = "APPROVED"
        elif sums[REJECT] == 0:
            status = "NEEDS_REVIEW"
        else:
            status = "PARTIAL"            # нецелевая часть оплачивается личными средствами
        result = {"receipt_id": receipt.get("id"), "merchant": receipt.get("merchant"), "status": status,
                  "approved": sums[APPROVE], "review": sums[REVIEW], "personal_pay": sums[REJECT], "items": items_out}
        self._append_log(result)
        return result

    def _append_log(self, record: dict):
        prev = self.log[-1]["hash"] if self.log else "0" * 64
        body = json.dumps(record, ensure_ascii=False, sort_keys=True)
        h = hashlib.sha256((prev + body).encode()).hexdigest()
        self.log.append({"ts": time.time(), "prev": prev, "hash": h, "record": record})

    def verify_log(self) -> bool:
        prev = "0" * 64
        for e in self.log:
            body = json.dumps(e["record"], ensure_ascii=False, sort_keys=True)
            if e["prev"] != prev or hashlib.sha256((prev + body).encode()).hexdigest() != e["hash"]:
                return False
            prev = e["hash"]
        return True
