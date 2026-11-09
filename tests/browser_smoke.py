"""Browser smoke checks for the six SmartRubleAI screens at real viewport sizes.

Requires Playwright for Python and system Google Chrome. Run with the
FastAPI demo listening on http://127.0.0.1:8765; no financial integrations.
Screenshots are generated as CI artifacts for design review.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMARTRUBLE_TEST_URL", "http://127.0.0.1:8765")
ARTIFACTS = Path("browser-artifacts")
ROUTES = ("", "estimates", "receipts", "history", "antifraud", "economics")
WIDTHS = (320, 375, 768, 1280, 1440)


def wait_for_server():
    for _ in range(90):
        try:
            with urlopen(BASE + "/health", timeout=2) as response:
                if response.status == 200:
                    return
        except (URLError, TimeoutError):
            time.sleep(1)
    raise AssertionError("FastAPI demo did not become available")


def assert_layout(page, label: str):
    result = page.evaluate("""() => ({
        width: window.innerWidth,
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        page: document.querySelector('#page').scrollWidth,
        pageClient: document.querySelector('#page').clientWidth
    })""")
    if result["doc"] > result["width"] + 2 or result["page"] > result["pageClient"] + 2:
        offenders = page.evaluate("""() => [...document.querySelectorAll('body *')]
            .map(el => ({tag: el.tagName, id: el.id, klass: String(el.className || '').slice(0,80),
                           right: Math.round(el.getBoundingClientRect().right)}))
            .filter(el => el.right > innerWidth + 3).slice(0,12)""")
        raise AssertionError(f"{label}: horizontal page overflow {result}: {offenders}")
    assert page.locator("#navigation a[data-page]").count() == 6, label
    assert page.locator(".brand-mark").evaluate("(img) => img.complete && img.naturalWidth > 0"), label


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    wait_for_server()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ru-RU")
        response = ctx.request.post(
            BASE + "/contracts",
            data=json.dumps({
                "grant_id": "browser-smoke-2026",
                "text": "Расходные материалы — 50 000 ₽\nОборудование — 120 000 ₽\nУслуги — 10 000 ₽"
            }),
            headers={"Content-Type": "application/json"},
        )
        assert response.status == 200, response.text()
        response = ctx.request.post(
            BASE + "/contracts/browser-smoke-2026/validate",
            data=json.dumps({
                "id": "smoke-receipt-1",
                "merchant": "Тестовый продавец",
                "items": [{"name": "Резистор", "qty": 1, "price": 100}]
            }),
            headers={"Content-Type": "application/json"},
        )
        assert response.status == 200, response.text()

        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        for width in WIDTHS:
            page.set_viewport_size({"width": width, "height": 900})
            for route in ROUTES:
                name = route or "overview"
                page.goto(BASE + "/app" + ("/" + route if route else ""), wait_until="domcontentloaded")
                page.locator("#page .page-head h1").wait_for(timeout=20000)
                assert_layout(page, f"{width}px/{name}")
                if width in (375, 1440):
                    page.screenshot(path=str(ARTIFACTS / f"{width}-{name}.png"), full_page=True)
                print(f"OK viewport={width}px screen={name}", flush=True)

        # Verify compact SVG actually renders descenders below its old bottom=128.
        # Geometry-only checks miss raster clipping; draw loaded same-origin SVG.
        page.set_viewport_size({"width": 1440, "height": 900})
        page.goto(BASE + "/app", wait_until="domcontentloaded")
        page.locator("#page .page-head h1").wait_for(timeout=20000)
        page.wait_for_function("""() => {
            const image = document.querySelector('.brand-wordmark');
            return image && image.complete && image.naturalWidth === 658 &&
                image.naturalHeight === 95;
        }""")
        ink = page.locator(".brand-wordmark").evaluate("""img => {
            const canvas = document.createElement('canvas');
            canvas.width = 658;
            canvas.height = 95;
            const context = canvas.getContext('2d', {willReadFrequently: true});
            context.drawImage(img, 0, 0);
            // The previous SVG viewport ended at y=128. With minY=50,
            // that used to clip all the visible descender pixels below row 78.
            const pixels = context.getImageData(0, 78, 658, 15).data;
            let count = 0;
            for (let p = 0; p < pixels.length; p += 4) {
                if (pixels[p+3] > 100 && pixels[p] < 180) count++;
            }
            return count;
        }""")
        assert ink > 8, f"Wordmark descenders still invisible or clipped: {ink}"
        print("OK vector wordmark descenders visible in Chrome", flush=True)

        # Mobile drawer should be inaccessible until opened and restore focus on Escape.
        page.set_viewport_size({"width": 375, "height": 812})
        page.goto(BASE + "/app", wait_until="domcontentloaded")
        page.locator("#page .page-head h1").wait_for(timeout=20000)
        assert page.locator("#sidebar").evaluate("(el) => el.inert"), "Closed drawer must be inert"
        page.locator("#menu-toggle").click()
        assert not page.locator("#sidebar").evaluate("(el) => el.inert"), "Open drawer must be interactive"
        assert page.locator("#menu-toggle").get_attribute("aria-expanded") == "true"
        page.keyboard.press("Escape")
        assert page.locator("#sidebar").evaluate("(el) => el.inert")
        assert page.locator("#menu-toggle").get_attribute("aria-expanded") == "false"
        assert page.locator("#menu-toggle").evaluate("(el) => document.activeElement === el")
        print("OK mobile drawer inert/focus/Escape", flush=True)

        page.goto(BASE + "/app/receipts", wait_until="domcontentloaded")
        page.locator("#page .page-head h1").wait_for(timeout=20000)
        for label in (".qty-label", ".price-label", ".total-label"):
            assert page.locator("#receipt-lines " + label).first.is_visible(), label
        page.goto(BASE + "/app/history", wait_until="domcontentloaded")
        page.locator("#page .page-head h1").wait_for(timeout=20000)
        assert page.locator(".table-swipe-hint").first.is_visible()
        print("OK mobile receipt field labels and table swipe hint", flush=True)

        # Desktop sidebar preference should persist across a reload.
        page.set_viewport_size({"width": 1440, "height": 900})
        page.goto(BASE + "/app", wait_until="domcontentloaded")
        page.locator("#page .page-head h1").wait_for(timeout=20000)
        page.locator("#sidebar-collapse").click()
        assert page.locator("html").get_attribute("data-sidebar") == "collapsed"
        assert_layout(page, "1440px collapsed")
        page.reload(wait_until="domcontentloaded")
        page.locator("#page .page-head h1").wait_for(timeout=20000)
        assert page.locator("html").get_attribute("data-sidebar") == "collapsed"
        page.locator("#sidebar-collapse").click()
        print("OK desktop collapse persistence", flush=True)

        # Run analytics as a real user, so malformed result markup is detected.
        page.goto(BASE + "/app/antifraud", wait_until="domcontentloaded")
        page.locator("#fraud-run").click()
        page.locator(".af-rank-item").first.wait_for(timeout=25000)
        assert page.locator(".af-rank-item").count() == 10
        page.locator(".af-rank-item").nth(1).click()
        assert page.locator("#af-detail .af-signal").count() == 6
        assert_layout(page, "anomaly populated")
        print("OK antifraud populated results", flush=True)

        page.goto(BASE + "/app/economics", wait_until="domcontentloaded")
        page.locator("#econ-submit").click()
        page.locator(".econ-chart").wait_for(timeout=20000)
        assert page.locator(".econ-case").count() == 3
        assert page.locator(".econ-table tbody tr").count() == 3
        assert_layout(page, "economics populated")
        print("OK economics results and chart", flush=True)

        assert not errors, f"Uncaught browser errors: {errors}"
        browser.close()
    print("BROWSER SMOKE PASS — six screens, five viewport widths, navigation and analytics", flush=True)


if __name__ == "__main__":
    main()
