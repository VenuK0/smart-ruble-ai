"""Checks for research-only ML comparisons; never tests real payment accuracy."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from smartruble.model_benchmark import decision_metrics, run


class ModelBenchmarkTests(unittest.TestCase):
    def test_risk_metrics_do_not_hide_dangerous_auto_approvals(self):
        result = decision_metrics(
            ["other", "other", "services", "consumables"],
            ["services", "other", "other", "consumables"],
            [0.85, 0.65, 0.8, 0.9],
        )
        self.assertEqual(result["false_approve_rate_other"], 0.5)
        self.assertEqual(result["false_reject_rate_allowed"], 0.5)
        self.assertEqual(result["auto_decision_coverage"], 1.0)
        self.assertEqual(result["accuracy"], 0.5)

    def test_risk_metrics_validate_input_shapes_and_probabilities(self):
        with self.assertRaises(ValueError):
            decision_metrics([], [], [])
        with self.assertRaises(ValueError):
            decision_metrics(["other"], [], [])
        with self.assertRaises(ValueError):
            decision_metrics(["other"], ["other"], [float("nan")])
        with self.assertRaises(ValueError):
            decision_metrics(["other"], ["other"], [1.1])

    def test_small_heldout_experiment_has_all_variants_and_reproducible_splits(self):
        summary = run([0], n_per_class=40)
        self.assertEqual(summary["mode"], "synthetic_held_out_base_comparison")
        self.assertEqual(len(summary["candidates"]), 3)
        for name, model in summary["candidates"].items():
            with self.subTest(name=name):
                self.assertEqual(len(model["runs"]), 1)
                self.assertGreater(model["runs"][0]["n_test"], 0)
                self.assertGreater(model["runs"][0]["n_other"], 0)
                self.assertGreaterEqual(model["mean"]["accuracy"], 0.0)
                self.assertLessEqual(model["mean"]["accuracy"], 1.0)
                self.assertGreaterEqual(model["mean"]["false_approve_rate_other"], 0.0)
                self.assertLessEqual(model["mean"]["false_approve_rate_other"], 1.0)


if __name__ == "__main__":
    unittest.main()
