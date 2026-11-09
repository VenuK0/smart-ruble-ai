"""API integration tests; all external financial systems are simulated."""
import os
import sys
import unittest
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from fastapi.testclient import TestClient
from smartruble.api import app, CONTRACTS

client = TestClient(app)


class ApiTests(unittest.TestCase):
    def setUp(self):
        CONTRACTS.clear()
        self.grant = "demo-" + uuid.uuid4().hex[:8]
        r = client.post("/contracts", json={
            "grant_id": self.grant, "text": "Расходные материалы — 50 000 ₽"
        })
        self.assertEqual(r.status_code, 200, r.text)

    def tearDown(self):
        CONTRACTS.clear()

    def test_health_and_html_demo(self):
        self.assertEqual(client.get("/health").json()["mode"], "simulation")
        r = client.get("/demo")
        self.assertEqual(r.status_code, 200)
        self.assertIn("SmartRubleAI", r.text)
        self.assertEqual(client.get("/contracts/" + self.grant).status_code, 200)

    def test_invalid_payments_rejected(self):
        endpoint = "/contracts/" + self.grant + "/validate"
        for item in [{"name": "Arduino", "price": -50},
                     {"name": "Arduino", "price": 0},
                     {"name": "Arduino", "price": "NaN"},
                     {"name": "Arduino", "qty": 0, "price": 100}]:
            with self.subTest(item=item):
                r = client.post(endpoint, json={"merchant": "Test", "items": [item]})
                self.assertEqual(r.status_code, 422, r.text)
        self.assertEqual(client.post(endpoint, json={"merchant": "Test", "items": []}).status_code, 422)

    def test_receipt_idempotency(self):
        endpoint = "/contracts/" + self.grant + "/validate"
        receipt = {"id": "unique-42", "merchant": "Test",
                   "items": [{"name": "arduino uno", "price": 500}]}
        first = client.post(endpoint, json=receipt)
        self.assertEqual(first.status_code, 200, first.text)
        second = client.post(endpoint, json=receipt)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json(), second.json())
        audit = client.get("/contracts/" + self.grant + "/audit").json()
        self.assertEqual(audit["entries"], 1)
        self.assertTrue(audit["chain_valid"])
        modified = {**receipt, "items": [{"name": "arduino uno", "price": 1000}]}
        self.assertEqual(client.post(endpoint, json=modified).status_code, 409)

    def test_duplicate_contract_and_missing_contract(self):
        r = client.post("/contracts", json={
            "grant_id": self.grant, "text": "Расходные материалы — 50 000 ₽"
        })
        self.assertEqual(r.status_code, 409)
        self.assertEqual(client.get("/contracts/missing").status_code, 404)

    def test_antifraud_synthetic(self):
        r = client.get("/antifraud/demo?seed=3")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["mode"], "synthetic")
        self.assertGreater(data["transactions"], 0)
        self.assertGreater(len(data["top"]), 0)
        self.assertEqual(len(data["top"]), 10)
        self.assertIn("не вероятность", data["score_note"])
        self.assertIn("не объяснение", data["signals_note"])
        for row in data["top"]:
            with self.subTest(merchant=row["merchant"]):
                signals = row["signals"]
                self.assertGreater(signals["transaction_count"], 0)
                self.assertGreater(signals["student_count"], 0)
                self.assertGreater(signals["average_amount_rub"], 0)
                for key in ["largest_student_share", "round_large_share", "night_share"]:
                    self.assertGreaterEqual(signals[key], 0)
                    self.assertLessEqual(signals[key], 1)
        self.assertEqual(data, client.get("/antifraud/demo?seed=3").json())
        self.assertEqual(client.get("/antifraud/demo?seed=10001").status_code, 422)


if __name__ == "__main__":
    unittest.main()
