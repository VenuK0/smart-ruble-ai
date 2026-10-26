import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from smartruble.parser import parse_estimate
from smartruble.contract import SmartContract, APPROVE, REVIEW, REJECT
from smartruble.classifier import ItemClassifier
from smartruble.data import make_items, make_transactions
from smartruble import antifraud

EST = """Расходные материалы — 40 000 ₽
Оборудование: 20 000 руб.
Услуги хостинга - 10 000
Прочее непонятное"""


class Stub:
    """Предсказуемый классификатор для тестов логики контракта."""
    table = {"arduino": ("consumables", .95), "пиво": ("other", .9), "мышь": ("other", .4),
             "книга": ("literature_software", .95), "осциллограф": ("equipment", .93)}
    def predict_one(self, name):
        return self.table[name]


class ParserTests(unittest.TestCase):
    def test_limits(self):
        r = parse_estimate(EST)
        self.assertEqual(r["limits"], {"consumables": 40000.0, "equipment": 20000.0, "services": 10000.0})
        self.assertEqual(r["unparsed"], ["Прочее непонятное"])


class ContractTests(unittest.TestCase):
    def mk(self):
        return SmartContract(limits={"consumables": 5000, "equipment": 20000}, classifier=Stub())

    def rc(self, *items):
        return {"id": "r1", "merchant": "M1", "items": [{"name": n, "qty": 1, "price": p} for n, p in items]}

    def test_approve_and_balance(self):
        c = self.mk(); r = c.validate(self.rc(("arduino", 2500)))
        self.assertEqual(r["status"], "APPROVED"); self.assertEqual(c.remaining("consumables"), 2500)

    def test_reject_nontarget_goes_to_personal_pay(self):
        c = self.mk(); r = c.validate(self.rc(("arduino", 1000), ("пиво", 150)))
        self.assertEqual(r["status"], "PARTIAL"); self.assertEqual(r["personal_pay"], 150); self.assertEqual(r["approved"], 1000)

    def test_low_confidence_goes_to_human(self):
        c = self.mk(); r = c.validate(self.rc(("мышь", 3000)))
        self.assertEqual(r["status"], "NEEDS_REVIEW"); self.assertEqual(r["items"][0]["decision"], REVIEW)

    def test_category_outside_estimate_goes_to_human_not_block(self):
        c = self.mk(); r = c.validate(self.rc(("книга", 900)))
        self.assertEqual(r["items"][0]["decision"], REVIEW)

    def test_limit_exceeded(self):
        c = self.mk(); c.validate(self.rc(("arduino", 4000)))
        r = c.validate(self.rc(("arduino", 2000)))
        self.assertEqual(r["items"][0]["decision"], REJECT); self.assertEqual(c.remaining("consumables"), 1000)

    def test_balance_never_negative(self):
        c = self.mk()
        for _ in range(10): c.validate(self.rc(("arduino", 900)))
        self.assertGreaterEqual(c.remaining("consumables"), 0)

    def test_audit_log_tamper_detected(self):
        c = self.mk(); c.validate(self.rc(("arduino", 100))); c.validate(self.rc(("пиво", 100)))
        self.assertTrue(c.verify_log())
        c.log[0]["record"]["approved"] = 999999
        self.assertFalse(c.verify_log())


class MLTests(unittest.TestCase):
    def test_classifier_trains_and_predicts_known_items(self):
        rows = make_items(100, 1)
        clf = ItemClassifier().fit([r[0] for r in rows], [r[1] for r in rows])
        cat, conf = clf.predict_one("пиво")
        self.assertEqual(cat, "other"); self.assertTrue(0 < conf <= 1)

    def test_antifraud_flags_planted_ring(self):
        tx, fraud = make_transactions(seed=3)
        top = {m for m, _ in antifraud.detect(tx, seed=3)[:len(fraud)]}
        self.assertEqual(top, fraud)


if __name__ == "__main__":
    unittest.main()
