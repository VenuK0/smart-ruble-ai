"""Шаблон смарт-контракта целевых средств (симуляция логики; не исполняется на платформе ЦБ).

Решение по каждой позиции: APPROVE / REVIEW / REJECT. Неуверенные случаи и статьи вне сметы уходят на ручную проверку
(человек в контуре), а не блокируются автоматически. Аудиторский след — журнал с цепочкой хэшей.
"""
from __future__ import annotations
import hashlib, json, time, copy
from decimal import Decimal, InvalidOperation
from threading import RLock
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
    processed_receipts: dict = field(default_factory=dict)
    review_resolutions: dict = field(default_factory=dict)  # (receipt_id, item_index) -> simulated resolution
    _lock: object = field(default_factory=RLock, repr=False)

    def remaining(self, cat: str) -> float:
        return round(float(Decimal(str(self.limits.get(cat, 0))) - Decimal(str(self.spent.get(cat, 0)))), 2)

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
        with self._lock:
            return self._validate_locked(receipt, commit=commit)

    def _validate_locked(self, receipt: dict, commit: bool = True) -> dict:
        """Прототип: одна и та же операция не должна повторно списывать лимит."""
        if not isinstance(receipt, dict):
            raise ValueError("Чек должен быть объектом")
        rid, merchant, items = receipt.get("id"), receipt.get("merchant"), receipt.get("items")
        if not isinstance(rid, str) or not rid.strip():
            raise ValueError("Нужен идентификатор чека")
        if not isinstance(merchant, str) or not merchant.strip():
            raise ValueError("Нужен продавец")
        if not isinstance(items, list) or not 1 <= len(items) <= 100:
            raise ValueError("Чек должен содержать 1–100 позиций")

        validated = []
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip():
                raise ValueError("У товара должно быть название")
            try:
                price = Decimal(str(item["price"]))
                qty = Decimal(str(item.get("qty", 1)))
            except (KeyError, InvalidOperation, ValueError, TypeError) as exc:
                raise ValueError("Неверная цена или количество") from exc
            amount = price * qty
            if not all(x.is_finite() and x > 0 for x in (price, qty, amount)):
                raise ValueError("Цена и количество должны быть положительными конечными числами")
            if price.as_tuple().exponent < -2 or amount.as_tuple().exponent < -2:
                raise ValueError("У суммы может быть не больше двух знаков после запятой")
            if amount > 1000000000:
                raise ValueError("Слишком большая сумма позиции")
            validated.append((item["name"].strip(), amount, str(qty), str(price)))

        fingerprint = hashlib.sha256(
            json.dumps((merchant.strip(), validated), ensure_ascii=False, sort_keys=True, default=str).encode()
        ).hexdigest()
        prev = self.processed_receipts.get(rid)
        if commit and prev:
            if prev[0] != fingerprint:
                raise ValueError("Идентификатор чека уже использован с другим содержимым")
            return copy.deepcopy(prev[1])

        prior_spent = copy.deepcopy(self.spent)
        prior_log_len = len(self.log)
        try:
            items_out, sums = [], {APPROVE: Decimal(0), REVIEW: Decimal(0), REJECT: Decimal(0)}
            for name, amount, _, _ in validated:
                dec, cat, conf, why = self._item_decision(name, float(amount))
                if dec == APPROVE and commit:
                    self.spent[cat] = round(float(Decimal(str(self.spent.get(cat, 0))) + amount), 2)
                sums[dec] += amount
                items_out.append({"name": name, "amount": float(amount), "decision": dec, "category": cat,
                                  "confidence": round(conf, 3), "reason": why})
            if not sums[REJECT] and not sums[REVIEW]:
                status = "APPROVED"
            elif not sums[REJECT]:
                status = "NEEDS_REVIEW"
            else:
                status = "PARTIAL"
            result = {"receipt_id": rid, "merchant": merchant.strip(), "status": status,
                      "approved": float(sums[APPROVE]), "review": float(sums[REVIEW]),
                      "personal_pay": float(sums[REJECT]), "items": items_out}
            if commit:
                self._append_log(result)
                self.processed_receipts[rid] = (fingerprint, copy.deepcopy(result))
            return result
        except Exception:
            self.spent = prior_spent
            del self.log[prior_log_len:]
            raise

    def list_reviews(self) -> list[dict]:
        """Pending and completed demonstration decisions; original receipts remain immutable."""
        with self._lock:
            rows = []
            for receipt_id, (_, receipt) in self.processed_receipts.items():
                for index, item in enumerate(receipt["items"]):
                    if item["decision"] != REVIEW:
                        continue
                    resolution = self.review_resolutions.get((receipt_id, index))
                    rows.append({
                        "receipt_id": receipt_id,
                        "merchant": receipt["merchant"],
                        "item_index": index,
                        "name": item["name"],
                        "amount": item["amount"],
                        "predicted_category": item["category"],
                        "reason": item["reason"],
                        "status": resolution["status"] if resolution else "PENDING",
                        "resolution": copy.deepcopy(resolution) if resolution else None,
                    })
            return rows

    def resolve_review(self, receipt_id: str, item_index: int, decision: str,
                       category: str | None, note: str) -> dict:
        """Record a human-like *demo* decision as a new hash-chained event.

        Never rewrite the initial receipt. This endpoint has no user identity;
        it must not be exposed as a real financial approval workflow.
        """
        with self._lock:
            if not isinstance(receipt_id, str) or receipt_id not in self.processed_receipts:
                raise ValueError("Чек не найден")
            receipt = self.processed_receipts[receipt_id][1]
            if not isinstance(item_index, int) or isinstance(item_index, bool) or not 0 <= item_index < len(receipt["items"]):
                raise ValueError("Позиция чека не найдена")
            item = receipt["items"][item_index]
            if item["decision"] != REVIEW:
                raise ValueError("Позиция не ожидает ручной проверки")
            if decision not in (APPROVE, REJECT):
                raise ValueError("Выберите одобрение или отклонение")
            if not isinstance(note, str) or not 4 <= len(note.strip()) <= 500:
                raise ValueError("Пояснение должно содержать от 4 до 500 символов")
            note = note.strip()
            if decision == APPROVE:
                if not isinstance(category, str) or category not in self.limits:
                    raise ValueError("Выберите разрешённую статью сметы")
            elif category is not None:
                raise ValueError("Для отклонения статья сметы не указывается")

            key = (receipt_id, item_index)
            prev = self.review_resolutions.get(key)
            if prev:
                if prev["decision"] == decision and prev["category"] == category and prev["note"] == note:
                    return copy.deepcopy(prev)
                raise ValueError("Решение по этой позиции уже зафиксировано")

            amount = Decimal(str(item["amount"]))
            if decision == APPROVE and amount > Decimal(str(self.remaining(category))):
                raise ValueError("Недостаточно средств по выбранной статье; одобрение невозможно")

            response = {
                "receipt_id": receipt_id, "item_index": item_index,
                "decision": decision, "status": "APPROVED" if decision == APPROVE else "REJECTED",
                "category": category, "amount": float(amount), "note": note,
            }
            event = {
                "event_type": "review_resolution", "receipt_id": receipt_id,
                "item_index": item_index, "decision": decision, "category": category,
                "amount": float(amount), "note": note,
            }
            previous_spent = copy.deepcopy(self.spent)
            previous_log_count = len(self.log)
            try:
                if decision == APPROVE:
                    self.spent[category] = float(
                        Decimal(str(self.spent.get(category, 0))) + amount
                    )
                self._append_log(event)
                self.review_resolutions[key] = copy.deepcopy(response)
                return copy.deepcopy(response)
            except Exception:
                self.spent = previous_spent
                del self.log[previous_log_count:]
                self.review_resolutions.pop(key, None)
                raise

    def _append_log(self, record: dict):
        prev = self.log[-1]["hash"] if self.log else "0" * 64
        ts = time.time()
        body = json.dumps({"ts": ts, "record": record}, ensure_ascii=False, sort_keys=True)
        h = hashlib.sha256((prev + body).encode()).hexdigest()
        self.log.append({"ts": ts, "prev": prev, "hash": h, "record": copy.deepcopy(record)})

    def verify_log(self) -> bool:
        prev = "0" * 64
        for entry in self.log:
            body = json.dumps({"ts": entry["ts"], "record": entry["record"]},
                              ensure_ascii=False, sort_keys=True)
            if entry["prev"] != prev or hashlib.sha256((prev + body).encode()).hexdigest() != entry["hash"]:
                return False
            prev = entry["hash"]
        return True
