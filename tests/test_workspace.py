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
                self.assertEqual(symbol[0].attrib.get("transform"), "translate(-7 -7)")
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
        self.assertIn('/app/static/brand/wordmark.svg?v=7', html)
        self.assertIn('/app/static/brand/mark.svg?v=6', html)
        self.assertNotIn('<span class="brand-text">', html)
        self.assertIn("КОНТРОЛЬ ГРАНТОВ И РАСХОДОВ", html)
        response = self.client.get("/app/static/brand/wordmark.svg")
        self.assertEqual(response.status_code, 200)
        self.assertIn('viewBox="244 50 658 95"', response.text)
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
        self.assertNotIn('data-theme="dark"', css)

    def test_single_light_theme_and_responsive_navigation(self):
        html = self.client.get("/app").text
        self.assertNotIn('id="theme-toggle"', html)
        self.assertNotIn('smartruble-theme', html)
        self.assertNotIn('/app/static/theme.js', html)
        self.assertIn('id="mobile-scrim"', html)
        self.assertIn('aria-controls="navigation"', html)
        self.assertIn('/app/static/design.css?v=7', html)
        self.assertIn('class="nav-icon"', html)
        css = self.client.get("/app/static/design.css").text
        self.assertIn('color-scheme:light', css)
        self.assertNotIn('color-scheme:dark', css)
        self.assertNotIn('data-theme="dark"', css)
        self.assertIn('--stat-good', css)
        self.assertIn('@media(max-width:680px)', css)
        self.assertEqual(self.client.get("/app/static/theme.js").status_code, 404)

    def test_light_theme_on_all_bookmarkable_pages(self):
        for path in ["/app", "/app/estimates", "/app/receipts", "/app/history",
                     "/app/antifraud", "/app/economics"]:
            with self.subTest(path=path):
                html = self.client.get(path).text
                self.assertIn('/app/static/design.css?v=7', html)
                self.assertNotIn('/app/static/theme.js', html)

    def test_wordmark_viewport_covers_cyrillic_descenders(self):
        """Compact wordmark must not crop the descenders of р and у."""
        import re
        from xml.etree import ElementTree as ET

        response = self.client.get("/app/static/brand/wordmark.svg")
        self.assertEqual(response.status_code, 200)
        root = ET.fromstring(response.text)
        x, y, width, height = map(float, root.attrib["viewBox"].split())
        self.assertEqual(width, 658)
        self.assertLessEqual(y, 51)
        self.assertGreaterEqual(y + height, 144)
        ns = {"s": "http://www.w3.org/2000/svg"}
        paths = root.findall(".//s:path", ns)
        self.assertGreaterEqual(len(paths), 12)
        # At scale .042969 and baseline 122, a -426-font-unit
        # descender reaches y=140.3: the old bottom=128 clipped it.
        transforms = [p.attrib.get("transform", "") for p in paths]
        self.assertTrue(any("scale(0.042969 -0.042969)" in t for t in transforms))
        self.assertTrue(any(re.search(r"-42[0-9]", p.attrib.get("d", ""))
                            for p in paths))
        css = self.client.get("/app/static/design.css").text
        self.assertIn("aspect-ratio:658 / 95", css)
        html = self.client.get("/app").text
        self.assertIn('class="brand-wordmark"', html)
        self.assertIn('width="174" height="25"', html)

    def test_lighter_vector_wordmark_filter(self):
        response = self.client.get("/app/static/brand/wordmark.svg")
        self.assertEqual(response.status_code, 200)
        from xml.etree import ElementTree as ET
        root = ET.fromstring(response.text)
        ns = {"s": "http://www.w3.org/2000/svg"}
        morphology = root.findall('.//s:feMorphology', ns)
        self.assertEqual(len(morphology), 1)
        self.assertEqual(morphology[0].attrib.get("operator"), "erode")
        self.assertEqual(morphology[0].attrib.get("radius"), "1.5")
        self.assertEqual(len(root.findall('.//s:text', ns)), 0)

    def test_financial_workbench_assets_and_safe_exports(self):
        for url in ["/app", "/app/estimates", "/app/receipts", "/app/history"]:
            with self.subTest(url=url):
                page = self.client.get(url).text
                self.assertIn("/app/static/workspace.css?v=2", page)
                self.assertIn("/app/static/export.js?v=1", page)
                self.assertIn("/app/static/app.js?v=13", page)
        css = self.client.get("/app/static/workspace.css")
        self.assertEqual(css.status_code, 200)
        self.assertIn(".welcome-panel", css.text)
        self.assertIn(".usage-meter", css.text)
        self.assertIn(".budget-summary", css.text)
        exporter = self.client.get("/app/static/export.js")
        self.assertEqual(exporter.status_code, 200)
        self.assertIn("SRCSV", exporter.text)
        self.assertIn("csv;charset=utf-8", exporter.text)

    def test_workbench_has_a_real_ledger_and_practical_workflows(self):
        script = self.client.get("/app/static/app.js").text
        for item in [
            "Начните с создания сметы",
            "Создать первую смету",
            "estimate-search",
            "estimate-export",
            "history-export",
            "receipt-total",
            "window.SRCSV.download",
            "choose-grant",
            "progressbar",
        ]:
            with self.subTest(item=item):
                self.assertIn(item, script)

    def test_estimates_use_compact_form_and_clean_main_outline(self):
        html = self.client.get("/app/estimates").text
        self.assertIn('/app/static/workspace.css?v=2', html)
        self.assertIn('<main class="content" id="page">', html)
        self.assertNotIn('tabindex="-1"', html)
        js = self.client.get("/app/static/app.js").text
        self.assertIn('class="estimates-layout"', js)
        self.assertIn('class="estimate-form-grid"', js)
        self.assertIn('class="register-empty"', js)
        self.assertIn('Смет пока нет', js)
        self.assertIn('if(contracts.length){', js)
        css = self.client.get("/app/static/workspace.css").text
        self.assertIn('grid-template-columns:minmax(230px,.7fr) minmax(0,1.3fr)', css)
        self.assertIn('.estimate-form-grid textarea', css)
        self.assertIn('@media(max-width:760px)', css)

    def test_active_budget_details_precede_create_new_budget(self):
        script = self.client.get("/app/static/app.js").text
        self.assertIn('function suggestedGrantId()', script)
        self.assertIn('new Date().getFullYear()', script)
        self.assertIn('while(used.has(base+"-"+n))n++', script)
        self.assertIn('field("grant-name","Номер сметы",suggestedGrantId())', script)
        self.assertIn('$("grant-name").value=suggestedGrantId()', script)
        self.assertIn('panel("Новая смета"', script)
        first = script.index('(estimate?\'<div class="stack detail-stack"')
        second = script.index('panel("Новая смета"')
        self.assertLess(first, second)
        self.assertIn('href="/app/receipts">Проверить чек', script)
        css = self.client.get("/app/static/workspace.css").text
        self.assertIn('.estimates-layout .detail-stack{margin:0', css)

    def test_grouped_navigation_and_real_destinations(self):
        html = self.client.get("/app").text
        self.assertIn('id="sidebar-collapse"', html)
        self.assertIn('aria-controls="navigation"', html)
        self.assertIn('aria-label="Свернуть боковое меню"', html)
        self.assertIn('aria-labelledby="nav-work-label"', html)
        self.assertIn('aria-labelledby="nav-analytics-label"', html)
        self.assertIn('Работа со средствами', html)
        self.assertIn('Аналитика', html)
        self.assertEqual(html.count('class="nav-text"'), 6)
        for section in ["overview", "estimates", "receipts", "history",
                        "antifraud", "economics"]:
            self.assertIn('data-page="'+section+'"', html)
        self.assertIn('/app/static/navigation.css?v=1', html)
        self.assertIn('/app/static/navigation.js?v=1', html)
        self.assertIn('localStorage.getItem("smartruble-sidebar")', html)
        self.assertNotIn('href="#', html)

    def test_sidebar_has_functional_compact_and_mobile_modes(self):
        css = self.client.get("/app/static/navigation.css")
        js = self.client.get("/app/static/navigation.js")
        self.assertEqual(css.status_code, 200)
        self.assertEqual(js.status_code, 200)
        for code in [
            '@media (min-width:961px)', 'data-sidebar="collapsed"',
            '--sidebar-compact:78px', '.nav-section',
            '.footer-link-text', '@media(max-width:960px)'
        ]:
            self.assertIn(code, css.text)
        self.assertIn('localStorage.setItem(key,next)', js.text)
        self.assertIn('aria-expanded', js.text)
        self.assertIn('aria-label', js.text)
        html = self.client.get("/app").text
        self.assertIn('id="menu-toggle"', html)
        self.assertIn('id="mobile-scrim"', html)
        self.assertIn('title="Исходный код"', html)
        self.assertIn('title="Документация API"', html)

    def test_receipt_editor_uses_financial_document_layout(self):
        html = self.client.get("/app/receipts").text
        self.assertIn('/app/static/receipts.css?v=2', html)
        self.assertIn('/app/static/receipt-utils.js?v=1', html)
        self.assertIn('/app/static/app.js?v=13', html)
        script = self.client.get("/app/static/app.js").text
        for text in [
            'class="receipt-context"',
            'class="receipts-layout"',
            'class="receipt-row receipt-columns"',
            'id="receipt-count"',
            'id="receipt-total"',
            'class="receipt-line-total"',
            'window.SRReceipt.inspect',
            'class="receipt-outcomes"',
            'class="receipt-decision-row"',
            'Статья: ',
            'Причина не указана',
            'id="receipt-new"',
            'setLocked(true)',
            'draftId=payload.id',
        ]:
            with self.subTest(text=text):
                self.assertIn(text, script)

    def test_receipt_form_assets_and_safety_explanations(self):
        for asset in ["/app/static/receipts.css", "/app/static/receipt-utils.js"]:
            response = self.client.get(asset)
            self.assertEqual(response.status_code, 200)
        css = self.client.get("/app/static/receipts.css").text
        for token in [
            ".receipt-context", ".receipt-form-body", ".receipt-outcomes",
            ".receipt-decision-text", "@media(max-width:680px)",
            "#receipt-new[hidden]",
        ]:
            self.assertIn(token, css)
        logic = self.client.get("/app/static/receipt-utils.js").text
        self.assertIn("amount*100-cents", logic)
        self.assertIn("items.length>100", logic)
        script = self.client.get("/app/static/app.js").text
        self.assertIn("не списаны из лимита автоматически", script)
        self.assertIn("setLocked(true)", script)
        self.assertIn("await reloadContracts(false)", script)
        self.assertIn("Чек сохранён, но данные сметы не обновились", script)

    def test_transaction_history_has_filterable_ledger_and_selected_details(self):
        html = self.client.get("/app/history").text
        self.assertIn('/app/static/history.css?v=1', html)
        self.assertIn('/app/static/history-utils.js?v=1', html)
        self.assertIn('/app/static/app.js?v=13', html)
        js = self.client.get("/app/static/app.js").text
        for token in [
            'class="history-context"',
            'id="history-stat-count"',
            'id="history-stat-approved"',
            'id="history-stat-review"',
            'id="history-stat-rejected"',
            'id="history-search"',
            'id="history-status"',
            'class="history-view"',
            'id="history-detail"',
            'history-item-description',
            'history-audit',
            'window.SRHistory.filter',
            'window.SRHistory.summarize',
            'aria-pressed',
            'Экспорт CSV',
            'Цепочка записей проверена',
            'Нарушена целостность журнала',
        ]:
            with self.subTest(token=token):
                self.assertIn(token, js)

    def test_review_state_explains_no_manual_queue_and_categories_are_precise(self):
        js = self.client.get("/app/static/app.js").text
        self.assertIn('Очередь согласования и интерфейс ручного одобрения', js)
        self.assertIn('ручное согласование в этой версии не реализовано', js)
        self.assertIn('x.category==="other"?"Не определена"', js)
        css = self.client.get("/app/static/receipts.css").text
        self.assertIn('font-size:12.5px;line-height:1.55', css)
        for url in ["/app/static/history.css", "/app/static/history-utils.js"]:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
        self.assertIn('@media(max-width:680px)', self.client.get("/app/static/history.css").text)

    def test_anomaly_dashboard_assets_and_explanations(self):
        html = self.client.get("/app/antifraud").text
        self.assertIn('/app/static/antifraud.css?v=1', html)
        self.assertIn('/app/static/antifraud-utils.js?v=1', html)
        self.assertIn('/app/static/app.js?v=13', html)
        for path in ["/app/static/antifraud.css", "/app/static/antifraud-utils.js"]:
            self.assertEqual(self.client.get(path).status_code, 200)
        js = self.client.get("/app/static/app.js").text
        for token in [
            'class="af-config"', 'class="af-summary"',
            'class="af-layout"', 'class="af-rank-list"',
            'class="af-signal-grid"', 'id="af-detail"',
            'window.SRAntifraud.barPositions',
            'window.SRAntifraud.notes',
            'Ночные операции',
            'Крупные круглые суммы',
            'Это не вероятность мошенничества',
            'не объяснение вклада признаков',
        ]:
            with self.subTest(token=token):
                self.assertIn(token, js)
        css = self.client.get("/app/static/antifraud.css").text
        self.assertIn('@media(max-width:680px)', css)
        self.assertIn('.af-rank-item.selected', css)

    def test_economics_ui_scenarios_and_assumption_disclaimers(self):
        html = self.client.get("/app/economics").text
        self.assertIn('/app/static/economics.css?v=1', html)
        self.assertIn('/app/static/economics-utils.js?v=1', html)
        self.assertIn('/app/static/app.js?v=13', html)
        for path in ["/app/static/economics.css", "/app/static/economics-utils.js"]:
            self.assertEqual(self.client.get(path).status_code, 200, path)
        js = self.client.get("/app/static/app.js").text
        for token in [
            'id="econ-form"', 'id="econ-results"', 'id="econ-result"',
            'class="econ-fields"', 'class="econ-preset"',
            'window.SREconomics.volumes', 'window.SREconomics.chartLines',
            'window.SREconomics.projection', 'window.SREconomics.barWidth',
            'Promise.all(volumes.map', '"/economics/scenario"',
            'Накопленный эффект за 5 лет', 'Анализ чувствительности',
            'Упрощённый накопленный эффект',
            'предположений', 'не подтверждённая экономия',
            'Простая окупаемость', 'Не достигается',
        ]:
            with self.subTest(token=token):
                self.assertIn(token, js)
        css = self.client.get("/app/static/economics.css").text
        self.assertIn('.econ-chart', css)
        self.assertIn('@media(max-width:680px)', css)
        self.assertIn('.econ-table-scroll', css)

    def test_polished_workspace_and_responsive_assets(self):
        for route in ["/app", "/app/estimates", "/app/receipts",
                      "/app/history", "/app/antifraud", "/app/economics"]:
            with self.subTest(route=route):
                html = self.client.get(route).text
                self.assertIn('/app/static/polish.css?v=2', html)
                self.assertIn('/app/static/app.js?v=13', html)
                self.assertIn('id="sidebar"', html)
                self.assertIn('id="mobile-scrim"', html)
                self.assertIn('Загружаем рабочее место', html)
        css_response = self.client.get("/app/static/polish.css")
        self.assertEqual(css_response.status_code, 200)
        css = css_response.text
        for selector in [
            ".workspace{min-width:0}", ".table-wrap,.econ-table-scroll",
            "@media(max-width:960px)", "@media(max-width:680px)",
            "@media(max-width:380px)", "@media print",
            ".page-loading", "font-size:16px",
        ]:
            with self.subTest(selector=selector):
                self.assertIn(selector, css)

    def test_mobile_menu_is_not_keyboard_accessible_when_closed(self):
        script = self.client.get("/app/static/app.js").text
        self.assertIn('function syncMobileMenu()', script)
        self.assertIn('sidebar.inert=mobile&&!opened', script)
        self.assertIn('sidebar.setAttribute("aria-hidden"', script)
        self.assertIn('$("menu-toggle").focus()', script)
        self.assertIn('syncMobileMenu();', script)

    def test_mobile_receipt_fields_and_table_hints(self):
        js = self.client.get("/app/static/app.js").text
        for label in [
            'receipt-mobile-label qty-label',
            'receipt-mobile-label price-label',
            'receipt-mobile-label total-label',
            'table-swipe-hint',
            'Таблица данных с горизонтальной прокруткой',
            'aria-label="Количество"',
            'aria-label="Цена за единицу, ₽"',
        ]:
            with self.subTest(label=label):
                self.assertIn(label, js)
        css = self.client.get("/app/static/polish.css").text
        self.assertIn('.receipt-row:not(.receipt-columns) .receipt-mobile-label', css)
        self.assertIn('.table-swipe-hint', css)
        self.assertIn('.table-wrap:focus-visible', css)
        html = self.client.get("/app/receipts").text
        self.assertIn('/app/static/polish.css?v=2', html)
        self.assertIn('/app/static/app.js?v=13', html)

    def test_selected_palette(self):
        css = self.client.get("/app/static/styles.css").text
        self.assertIn("#FBF7F1", css)
        self.assertIn("#BB080B", css)
        self.assertIn("#191919", css)

if __name__ == "__main__":
    unittest.main()
