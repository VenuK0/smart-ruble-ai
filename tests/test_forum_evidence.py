"""Evidence-pack regression tests: denominators, replay invariants and file hashes."""
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from scripts.forum_evidence import (classifier_trial, antifraud_trial, collect,
                                    review_workflow, write_bundle)


class ForumEvidenceTests(unittest.TestCase):
    def test_classifier_heldout_counts_and_rates(self):
        result = classifier_trial(0, sample_size=40)
        self.assertGreater(result["n_test"], 0)
        self.assertGreater(result["n_other"], 0)
        self.assertEqual(result["n_test"], result["n_other"] + result["n_allowed"])
        self.assertEqual(result["n_test"], result["auto_approved"] +
                         result["auto_rejected"] + result["manual_review"])
        self.assertEqual(result["accuracy"], round(result["correct"] / result["n_test"], 5))
        self.assertEqual(result["dangerous_rate_other"],
                         round(result["dangerous_approvals"] / result["n_other"], 5))

    def test_anomaly_denominators_include_false_alerts(self):
        trial = antifraud_trial(0)
        self.assertEqual(trial["found_top_k"] + trial["false_alerts_top_k"],
                         trial["planted"])
        self.assertEqual(trial["found_top_k_plus_2"] +
                         trial["false_alerts_top_k_plus_2"], trial["planted"] + 2)
        self.assertLessEqual(trial["found_top_k_masked"], trial["planted"])

    def test_scripted_review_preserves_financial_invariants(self):
        result = review_workflow()
        self.assertTrue(result["overspend_blocked"])
        self.assertTrue(result["original_receipts_immutable"])
        self.assertTrue(result["hash_chain_valid"])
        self.assertEqual(result["final_spent_rub"] + result["remaining_rub"],
                         result["initial_budget_rub"])
        self.assertEqual(result["audit_entries"], 4)
        self.assertEqual(result["review_statuses"], ["APPROVED", "REJECTED"])

    def test_reproducible_bundle_and_sha256_integrity(self):
        report = collect([0], [0], 40)
        with tempfile.TemporaryDirectory() as folder:
            first = Path(folder) / "first"
            second = Path(folder) / "second"
            manifest = write_bundle(report, first)
            self.assertEqual(manifest, write_bundle(report, second))
            self.assertIn("classifier_seeds.csv", manifest)
            self.assertIn("antifraud_seeds.csv", manifest)
            self.assertIn("SUMMARY.md", manifest)
            for filename, expected in manifest.items():
                raw = (first / filename).read_bytes()
                self.assertEqual(raw, (second / filename).read_bytes())
                self.assertEqual(hashlib.sha256(raw).hexdigest(), expected)
            saved = json.loads((first / "results.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["schema"], "forum-evidence-v1")
            self.assertFalse(saved["limitations"]["pilot_data"])
            self.assertFalse(saved["limitations"]["measured_ruble_savings"])

    def test_invalid_seed_arguments_rejected(self):
        for seeds, other, size in [([], [0], 40), ([0, 0], [0], 40),
                                   ([0], [0, 0], 40), ([0], [0], 5)]:
            with self.subTest(seeds=seeds, fraud=other, n=size):
                with self.assertRaises(ValueError):
                    collect(seeds, other, size)


if __name__ == "__main__":
    unittest.main()
