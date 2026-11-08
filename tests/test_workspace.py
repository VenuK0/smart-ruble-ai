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


    def test_russian_brand_and_favicon(self):
        html = self.client.get("/app").text
        self.assertIn("СмартРубль", html)
        self.assertIn("Контроль грантов и расходов", html)
        self.assertIn('/app/static/brand/mark.svg', html)
        self.assertIn('/app/static/brand/favicon.svg', html)
        self.assertIn('application-name" content="SmartRubleAI', html)

    def test_vector_brand_assets(self):
        from xml.etree import ElementTree
        for name in ("mark.svg", "favicon.svg", "logo.svg"):
            with self.subTest(name=name):
                response = self.client.get("/app/static/brand/" + name)
                self.assertEqual(response.status_code, 200)
                root = ElementTree.fromstring(response.text)
                self.assertTrue(root.tag.endswith("svg"))
                self.assertIn("#BB080B", response.text)
        self.assertIn("КОНТРОЛЬ ГРАНТОВ И РАСХОДОВ",
                      self.client.get("/app/static/brand/logo.svg").text)

    def test_approved_red_contour_black_ruble(self):
        from xml.etree import ElementTree as ET
        ns = {"s": "http://www.w3.org/2000/svg"}
        for name in ("mark.svg", "favicon.svg", "logo.svg"):
            with self.subTest(name=name):
                response = self.client.get("/app/static/brand/" + name)
                self.assertEqual(response.status_code, 200)
                root = ET.fromstring(response.text)
                expected_stroke = "4.8" if name == "logo.svg" else "6.5"
                contours = [
                    group for group in root.findall(".//s:g", ns)
                    if group.attrib.get("stroke-width") == expected_stroke
                ]
                self.assertEqual(len(contours), 1)
                self.assertEqual(contours[0].attrib["stroke"], "#BB080B")
                self.assertEqual(len(contours[0].findall("s:path", ns)), 4)
                symbol = [
                    group for group in root.findall(".//s:g", ns)
                    if group.attrib.get("fill") == "#111111"
                    and len(group.findall("s:rect", ns)) == 2
                ]
                self.assertEqual(len(symbol), 1)
                self.assertEqual(symbol[0].attrib.get("transform"), "translate(-7 0)")
                self.assertEqual(len(symbol[0].findall("s:path", ns)), 1)
                self.assertEqual(len(symbol[0].findall("s:rect", ns)), 2)
                if name == "favicon.svg":
                    background = root.find("s:rect", ns)
                    self.assertIsNotNone(background)
                    self.assertEqual(background.attrib["fill"], "#FBF7F1")
                if name == "logo.svg":
                    self.assertEqual(root.find("s:rect", ns).attrib["fill"], "#FBF7F1")
                    # Text is outlined in paths: it cannot change fonts in GitHub dark mode.
                    self.assertEqual(len(root.findall(".//s:text", ns)), 0)
                    self.assertGreater(len(root.findall(".//s:path", ns)), 25)

    def test_sidebar_uses_exact_vector_wordmark_instead_of_html_retyping(self):
        html = self.client.get("/app").text
        self.assertIn('class="brand brand-lockup"', html)
        self.assertIn('/app/static/brand/wordmark.svg?v=5', html)
        self.assertIn('/app/static/brand/mark.svg?v=5', html)
        self.assertNotIn('<span class="brand-text">', html)
        self.assertIn("КОНТРОЛЬ ГРАНТОВ И РАСХОДОВ", html)
        response = self.client.get("/app/static/brand/wordmark.svg")
        self.assertEqual(response.status_code, 200)
        self.assertIn('viewBox="244 51 658 77"', response.text)
        self.assertIn('#BB080B', response.text)
        self.assertIn('#111111', response.text)
        from xml.etree import ElementTree as ET
        root = ET.fromstring(response.text)
        self.assertEqual(len(root.findall('.//{http://www.w3.org/2000/svg}text')), 0)
        self.assertGreaterEqual(len(root.findall('.//{http://www.w3.org/2000/svg}path')), 12)

    def test_sidebar_brand_colors_and_readability_are_theme_independent(self):
        css = self.client.get("/app/static/design.css").text
        self.assertIn('.brand.brand-lockup', css)
        self.assertIn('background:#FBF7F1', css)
        self.assertIn('min-height:79px', css)
        self.assertIn('width:56px', css)
        self.assertIn('font-size:9px', css)
        self.assertIn('grid-template-columns:286px', css)
        self.assertIn('data-theme="dark"', css)

    def test_theme_switch_and_responsive_navigation(self):
        html = self.client.get("/app").text
        self.assertIn('id="theme-toggle"', html)
        self.assertIn('aria-pressed="false"', html)
        self.assertIn('id="mobile-scrim"', html)
        self.assertIn('aria-controls="navigation"', html)
        self.assertIn('/app/static/design.css', html)
        self.assertIn('/app/static/theme.js', html)
        self.assertIn('smartruble-theme', html)
        for url, words in [
            ("/app/static/design.css", ['data-theme="dark"', "--stat-good", "@media(max-width:680px)"]),
            ("/app/static/theme.js", ["localStorage.setItem", "aria-pressed", "Тёмная тема"]),
        ]:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            for word in words:
                self.assertIn(word, response.text)
        self.assertIn('class="nav-icon"', html)

    def test_theme_is_shared_across_all_bookmarkable_pages(self):
        for path in ["/app", "/app/estimates", "/app/receipts", "/app/history",
                     "/app/antifraud", "/app/economics"]:
            with self.subTest(path=path):
                html = self.client.get(path).text
                self.assertIn('/app/static/design.css', html)
                self.assertIn('/app/static/theme.js', html)

    def test_selected_palette(self):
        css = self.client.get("/app/static/styles.css").text
        self.assertIn("#FBF7F1", css)
        self.assertIn("#BB080B", css)
        self.assertIn("#191919", css)

if __name__ == "__main__":
    unittest.main()
