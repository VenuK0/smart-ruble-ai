"""Проверка критичных финансовых инвариантов прототипа."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from smartruble.parser import parse_estimate
from smartruble.contract import SmartContract


class PredictableClassifier:
    def predict_one(self, name):
        return ("consumables", 0.99)


class SafetyTests(unittest.TestCase):
    def contract(self):
        return SmartContract(limits={"consumables": 1000}, classifier=PredictableClassifier())

    def receipt(self, rid="r1", price=100):
        return {"id": rid, "merchant": "Test merchant",
                "items": [{"name": "Arduino", "qty": 1, "price": price}]}

    def test_estimate_decimal_separators(self):
        for input_amount in ["12 345,67", "12 345.67"]:
            with self.subTest(input_amount=input_amount):
                result = parse_estimate("Расходные материалы — " + input_amount + " ₽")
                self.assertEqual(result["limits"].get("consumables"), 12345.67)

    def test_rejects_negative_and_nonfinite_amounts(self):
        for value in [-100, 0, float("nan"), float("inf")]:
            with self.subTest(value=value):
                c = self.contract()
                with self.assertRaises(ValueError):
                    c.validate(self.receipt(price=value))
                self.assertEqual(c.log, [])
                self.assertEqual(c.spent, {})

    def test_same_receipt_is_idempotent(self):
        c = self.contract()
        first = c.validate(self.receipt())
        self.assertEqual(first, c.validate(self.receipt()))
        self.assertEqual(c.remaining("consumables"), 900)
        self.assertEqual(len(c.log), 1)

    def test_reused_id_with_changed_content_rejected(self):
        c = self.contract()
        c.validate(self.receipt())
        with self.assertRaisesRegex(ValueError, "уже использован"):
            c.validate(self.receipt(price=150))
        self.assertEqual(c.remaining("consumables"), 900)

    def test_tampering_with_audit_timestamp_is_detected(self):
        c = self.contract()
        c.validate(self.receipt())
        self.assertTrue(c.verify_log())
        c.log[0]["ts"] = 0
        self.assertFalse(c.verify_log())

    def test_dry_run_does_not_mutate_contract(self):
        c = self.contract()
        c.validate(self.receipt(), commit=False)
        self.assertEqual(c.remaining("consumables"), 1000)
        self.assertEqual(len(c.log), 0)


if __name__ == "__main__":
    unittest.main()
