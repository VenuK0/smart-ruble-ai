"""Safety and API tests for the local-only human-in-the-loop demonstration.

No authorization, users, external payment systems or persistent database are
included. An approval below changes *simulated* balances only.
"""
import os
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from fastapi.testclient import TestClient
from smartruble.api import app, CONTRACTS
from smartruble.contract import SmartContract, REVIEW


class FixedClassifier:
    def predict_one(self, name):
        return {
            "мышь": ("other", 0.4),
            "книга": ("literature_software", 0.95),
            "arduino": ("consumables", 0.96),
            "пиво": ("other", 0.95),
        }[name]


def make_contract(limit=500):
    return SmartContract(limits={"consumables": limit}, classifier=FixedClassifier())


def send(contract, identifier, name, amount):
    return contract.validate({
        "id": identifier, "merchant": "Учебный продавец",
        "items": [{"name": name, "price": amount, "qty": 1}],
    })


class ReviewContractTests(unittest.TestCase):
    def test_approval_deducts_once_but_keeps_original_receipt_immutable(self):
        c = make_contract()
        receipt = send(c, "r1", "мышь", 200)
        self.assertEqual(receipt["items"][0]["decision"], REVIEW)
        self.assertEqual(c.remaining("consumables"), 500)
        self.assertEqual(c.list_reviews()[0]["status"], "PENDING")
        decision = c.resolve_review("r1", 0, "APPROVE", "consumables", "Разрешено сметой")
        self.assertEqual(decision["status"], "APPROVED")
        self.assertEqual(c.remaining("consumables"), 300)
        self.assertEqual(len(c.log), 2)
        self.assertEqual(c.log[1]["record"]["event_type"], "review_resolution")
        self.assertEqual(c.list_reviews()[0]["status"], "APPROVED")
        self.assertEqual(receipt, c.processed_receipts["r1"][1])
        self.assertEqual(receipt["items"][0]["decision"], REVIEW)
        self.assertEqual(c.resolve_review("r1", 0, "APPROVE", "consumables", "Разрешено сметой"), decision)
        self.assertEqual(len(c.log), 2)
        self.assertEqual(c.remaining("consumables"), 300)
        self.assertEqual(send(c, "r1", "мышь", 200), receipt)
        self.assertEqual(c.remaining("consumables"), 300)
        self.assertTrue(c.verify_log())

    def test_rejection_does_not_consume_budget(self):
        c = make_contract()
        send(c, "reject1", "мышь", 125)
        decision = c.resolve_review("reject1", 0, "REJECT", None, "Нет в плановых расходах")
        self.assertEqual(decision["status"], "REJECTED")
        self.assertEqual(c.remaining("consumables"), 500)
        self.assertEqual(c.list_reviews()[0]["status"], "REJECTED")
        self.assertEqual(len(c.log), 2)
        self.assertTrue(c.verify_log())

    def test_reapproval_refused_when_remaining_budget_is_insufficient(self):
        c = make_contract(limit=300)
        send(c, "reviewed", "мышь", 250)
        send(c, "auto", "arduino", 200)
        self.assertEqual(c.remaining("consumables"), 100)
        with self.assertRaisesRegex(ValueError, "Недостаточно средств"):
            c.resolve_review("reviewed", 0, "APPROVE", "consumables", "Допустить расход")
        self.assertEqual(c.list_reviews()[0]["status"], "PENDING")
        self.assertEqual(len(c.log), 2)
        self.assertEqual(c.remaining("consumables"), 100)
        self.assertTrue(c.verify_log())

    def test_invalid_categories_notes_and_nonreviewable_items_do_not_mutate(self):
        c = make_contract()
        send(c, "pending", "мышь", 100)
        send(c, "approved", "arduino", 100)
        checks = [
            ("pending", 0, "APPROVE", "other", "Допустить"),
            ("pending", 0, "APPROVE", None, "Допустить"),
            ("pending", 0, "REJECT", "consumables", "Отказано"),
            ("pending", 0, "REJECT", None, "нет"),
            ("pending", 3, "REJECT", None, "Отказано"),
            ("approved", 0, "REJECT", None, "Отказано"),
            ("missing", 0, "REJECT", None, "Отказано"),
        ]
        for args in checks:
            with self.subTest(args=args):
                with self.assertRaises(ValueError):
                    c.resolve_review(*args)
        self.assertEqual(len(c.log), 2)
        self.assertEqual(c.remaining("consumables"), 400)
        self.assertTrue(c.verify_log())

    def test_changed_decision_conflicts_and_event_tampering_is_detected(self):
        c = make_contract()
        send(c, "r1", "мышь", 40)
        c.resolve_review("r1", 0, "REJECT", None, "Не согласовано")
        for args in [
            ("r1", 0, "APPROVE", "consumables", "Не согласовано"),
            ("r1", 0, "REJECT", None, "Другое мнение"),
        ]:
            with self.assertRaisesRegex(ValueError, "уже зафиксировано"):
                c.resolve_review(*args)
        self.assertEqual(len(c.log), 2)
        self.assertTrue(c.verify_log())
        c.log[1]["record"]["note"] = "подмена"
        self.assertFalse(c.verify_log())

    def test_simultaneous_retries_charge_only_once(self):
        c = make_contract()
        send(c, "r1", "мышь", 100)
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(
                lambda _: c.resolve_review("r1", 0, "APPROVE", "consumables", "Допустить расход"),
                range(24),
            ))
        self.assertTrue(all(x == results[0] for x in results))
        self.assertEqual(len(c.log), 2)
        self.assertEqual(c.remaining("consumables"), 400)
        self.assertTrue(c.verify_log())


class ReviewApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        CONTRACTS.clear()
        self.grant = "review-api-demo"
        CONTRACTS[self.grant] = make_contract()
        send(CONTRACTS[self.grant], "pending", "мышь", 200)
        send(CONTRACTS[self.grant], "rejected-auto", "пиво", 50)

    def tearDown(self):
        CONTRACTS.clear()

    def test_api_review_lifecycle_keeps_receipt_history_clean(self):
        base = "/contracts/" + self.grant
        queue = self.client.get(base + "/reviews")
        self.assertEqual(queue.status_code, 200)
        self.assertEqual(queue.json()["mode"], "simulation")
        self.assertEqual(queue.json()["pending"], 1)
        self.assertEqual(len(queue.json()["items"]), 1)
        target = base + "/reviews/pending/0/resolve"
        request = {"decision": "APPROVE", "category": "consumables", "note": "Разрешено комиссией"}
        result = self.client.post(target, json=request)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["status"], "APPROVED")
        self.assertEqual(self.client.post(target, json=request).status_code, 200)
        self.assertEqual(self.client.post(target, json={**request, "note": "Изменено"}).status_code, 409)
        self.assertEqual(self.client.get(base + "/reviews").json()["resolved"], 1)
        self.assertEqual(self.client.get(base).json()["spent"]["consumables"], 200)
        audit = self.client.get(base + "/audit").json()
        self.assertEqual(audit["entries"], 3)
        self.assertTrue(audit["chain_valid"])
        history = self.client.get(base + "/history").json()
        self.assertEqual(history["review_events"], 1)
        self.assertEqual(len(history["entries"]), 2)
        self.assertTrue(all("items" in x["record"] for x in history["entries"]))
        original = next(x["record"] for x in history["entries"] if x["record"]["receipt_id"] == "pending")
        self.assertEqual(original["items"][0]["decision"], "REVIEW")

    def test_api_validation_and_nonreviewable_item(self):
        root = "/contracts/" + self.grant + "/reviews"
        self.assertEqual(self.client.get("/contracts/missing/reviews").status_code, 404)
        self.assertEqual(self.client.post(root + "/missing/0/resolve",
                        json={"decision": "REJECT", "note": "Отказано"}).status_code, 404)
        self.assertEqual(self.client.post(root + "/rejected-auto/0/resolve",
                        json={"decision": "REJECT", "note": "Отказано"}).status_code, 422)
        self.assertEqual(self.client.post(root + "/pending/0/resolve",
                        json={"decision": "MAYBE", "note": "Отказано"}).status_code, 422)
        self.assertEqual(self.client.post(root + "/pending/0/resolve",
                        json={"decision": "APPROVE", "category": "other",
                              "note": "Допустить"}).status_code, 422)
        self.assertEqual(self.client.post(root + "/pending/0/resolve",
                        json={"decision": "REJECT", "note": "Отказано",
                              "role": "admin"}).status_code, 422)
        self.assertEqual(self.client.get(root).json()["pending"], 1)


if __name__ == "__main__":
    unittest.main()
