"""The demo-preparation command may only contact an existing localhost server."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from scripts.prepare_forum_demo import prepare


class DemoSeedSafetyTests(unittest.TestCase):
    def test_external_hosts_and_scheme_are_rejected_before_network_io(self):
        for url in ("https://localhost:8000", "http://example.org:8000",
                    "http://127.0.0.2:8000", "http://user:pass@localhost:8000",
                    "http://localhost:8000/unexpected", "http://localhost:8000/?q=1"):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    prepare(url)

    def test_non_demo_grant_rejected_before_network_io(self):
        with self.assertRaises(ValueError):
            prepare("http://localhost:8000", grant="personal-grant-123")


if __name__ == "__main__":
    unittest.main()
