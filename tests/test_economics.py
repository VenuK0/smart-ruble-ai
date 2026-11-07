"""Тесты модели эффекта: формулы проверяются, результат не считается измеренным."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from smartruble.economics import scenario
from fastapi.testclient import TestClient
from smartruble.api import app


class EconomicsTests(unittest.TestCase):
    def test_example_calculation(self):
        result = scenario(5000, 20, 8, 450, 200000, 1018000)
        self.assertEqual(result["hours_saved_per_year"], 1000)
        self.assertEqual(result["gross_labor_value_rub_year"], 450000)
        self.assertEqual(result["net_effect_rub_year"], 250000)
        self.assertEqual(result["payback_years"], 4.07)
        self.assertEqual(result["mode"], "illustrative_assumptions")

    def test_non_positive_net_no_payback(self):
        result = scenario(2000, 20, 8, 450, 200000, 1018000)
        self.assertLess(result["net_effect_rub_year"], 0)
        self.assertIsNone(result["payback_years"])

    def test_invalid_assumptions(self):
        with self.assertRaises(ValueError):
            scenario(5000, 8, 20, 450, 200000, 1018000)

    def test_api_calculator(self):
        r = TestClient(app).post("/economics/scenario", json={
            "workflows_per_year": 10000, "manual_minutes": 20,
            "automated_minutes": 8, "hourly_cost_rub": 450,
            "maintenance_rub_year": 200000, "development_rub": 1018000,
        })
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["net_effect_rub_year"], 700000)


if __name__ == "__main__":
    unittest.main()
