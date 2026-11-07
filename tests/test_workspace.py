"""Checks for multi-page research workspace and its static assets."""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from fastapi.testclient import TestClient
from smartruble.api import app


class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_real_urls_are_bookmarkable(self):
        paths = ["/app", "/app/overview", "/app/estimates", "/app/receipts",
                 "/app/history", "/app/antifraud", "/app/economics"]
        for url in paths:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn("text/html", response.headers["content-type"])
                self.assertIn("SmartRubleAI", response.text)
                self.assertIn('/app/static/app.js', response.text)
                self.assertIn('/app/static/styles.css', response.text)

    def test_wrong_path_is_not_silently_accepted(self):
        self.assertEqual(self.client.get("/app/not-found").status_code, 404)

    def test_sidebar_links_real_pages_not_anchors(self):
        html = self.client.get("/app").text
        for path in ["estimates", "receipts", "history", "antifraud", "economics"]:
            self.assertIn('href="/app/'+path+'"', html)
        self.assertNotIn('href="#estimate"', html)

    def test_styles_and_logic_serve_from_real_urls(self):
        for url, expected in [
            ("/app/static/styles.css", "color-scheme:light"),
            ("/app/static/app.js", "showEstimates"),
        ]:
            with self.subTest(url=url):
                response=self.client.get(url)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn(expected, response.text)

    def test_legacy_demo_kept(self):
        self.assertEqual(self.client.get("/demo").status_code, 200)


if __name__ == "__main__":
    unittest.main()
