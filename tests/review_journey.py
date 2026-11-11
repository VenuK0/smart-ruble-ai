"""Real Chrome journey: local-only review queue, budget and immutable receipt audit.

Runs against the disposable CI FastAPI server. Never target actual financial
services or any host other than localhost/127.0.0.1.
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

BASE = os.getenv("SMARTRUBLE_TEST_URL", "http://127.0.0.1:8765")
ARTIFACTS = Path("browser-artifacts")


def main():
    assert BASE.startswith(("http://127.0.0.1:", "http://localhost:")), "Tests must run on localhost"
    ARTIFACTS.mkdir(exist_ok=True)
    with urlopen(BASE + "/health", timeout=10) as res:
        assert json.load(res)["mode"] == "simulation"

    grant = "review-e2e-" + uuid.uuid4().hex[:9]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="ru-RU")
        ctx.add_init_script("sessionStorage.setItem('sr-active-grant', " + json.dumps(grant) + ");")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        root = "/contracts/" + quote(grant, safe="")

        created = ctx.request.post(BASE + "/contracts", data={
            "grant_id": grant, "text": "Услуги - 300"
        })
        assert created.status == 200, created.text()
        receipts = []
        for i, price in enumerate((175, 200), 1):
            response = ctx.request.post(BASE + root + "/validate", data={
                "id": f"manual-receipt-{i}", "merchant": "Учебный магазин",
                "items": [{"name": "arduino uno r3", "price": price, "qty": 1}]
            })
            assert response.status == 200, response.text()
            record = response.json()
            assert record["items"][0]["decision"] == "REVIEW", record
            receipts.append(record)

        page.goto(BASE + "/app/history", wait_until="domcontentloaded")
        page.locator("#review-queue .review-item").first.wait_for(timeout=20000)
        assert page.locator("#review-queue .review-item").count() == 2
        assert "2 ожидают решения" in page.locator("#review-count").inner_text()
        assert page.locator(".review-category").count() == 2
        assert "локальная симуляция" in page.locator(".history-notice").inner_text().lower()
        page.screenshot(path=str(ARTIFACTS / "review-01-pending-mobile.png"), full_page=True)
        print("REVIEW 1/4: two pending items visible in mobile Chrome", flush=True)

        first = page.locator("#review-queue .review-item").first
        first.locator(".review-category").select_option("services")
        first.locator(".review-note").fill("Проверено по условиям сметы")
        with page.expect_response(lambda r: "/resolve" in r.url and r.request.method == "POST") as result:
            first.locator('[data-decision="APPROVE"]').click()
        assert result.value.status == 200, result.value.text()
        page.wait_for_function("() => document.querySelector('#review-count')?.textContent.includes('1 ожидают')")
        info = ctx.request.get(BASE + root).json()
        assert info["spent"]["services"] == 175, info
        assert info["remaining"]["services"] == 125, info
        assert ctx.request.get(BASE + root + "/audit").json()["entries"] == 3
        assert "обработано" in page.locator("#review-count").inner_text()
        print("REVIEW 2/4: manual approval charges one simulated item only once", flush=True)

        second = page.locator("#review-queue .review-item").first
        second.locator(".review-category").select_option("services")
        second.locator(".review-note").fill("Попытка согласовать сверх лимита")
        with page.expect_response(lambda r: "/resolve" in r.url and r.request.method == "POST") as rejected:
            second.locator('[data-decision="APPROVE"]').click()
        assert rejected.value.status == 409, rejected.value.text()
        assert "Недостаточно средств" in second.locator(".review-inline-error").inner_text()
        assert ctx.request.get(BASE + root).json()["spent"]["services"] == 175
        second.locator(".review-note").fill("Отклонено по ограничению сметы")
        with page.expect_response(lambda r: "/resolve" in r.url and r.request.method == "POST") as accepted:
            second.locator('[data-decision="REJECT"]').click()
        assert accepted.value.status == 200, accepted.value.text()
        page.wait_for_function("() => document.querySelector('#review-count')?.textContent.includes('0 ожидают')")
        assert page.locator("#review-queue .review-complete").count() == 2
        page.screenshot(path=str(ARTIFACTS / "review-02-resolved-mobile.png"), full_page=True)
        print("REVIEW 3/4: overspend blocked; rejection recorded with no additional charge", flush=True)

        audit = ctx.request.get(BASE + root + "/audit").json()
        history = ctx.request.get(BASE + root + "/history").json()
        queue = ctx.request.get(BASE + root + "/reviews").json()
        assert audit["entries"] == 4 and audit["chain_valid"], audit
        assert history["review_events"] == 2 and len(history["entries"]) == 2, history
        assert all(entry["record"]["items"][0]["decision"] == "REVIEW" for entry in history["entries"])
        assert queue["pending"] == 0 and queue["resolved"] == 2
        assert ctx.request.get(BASE + root).json()["spent"]["services"] == 175
        assert "Ручное демо-решение" in page.locator("#history-detail").inner_text()
        assert not errors, errors
        print("REVIEW 4/4: immutable receipt records and whole hash chain verified", flush=True)
        ctx.close()
        browser.close()
    print("REVIEW JOURNEY PASS — local approval, overspend block, rejection and audit", flush=True)


if __name__ == "__main__":
    main()
