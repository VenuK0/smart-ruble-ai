"""Full forum-demo browser journey through the real SmartRubleAI API.

Unlike browser_smoke.py (page/layout smoke), this verifies a complete
data lifecycle using the visible application form controls:
estimate -> two receipts -> audit/history -> CSV -> anomalies -> economics.

Run with a *disposable* local FastAPI simulation server on port 8765.
Never point these tests at a user's production server or real financial data.
"""
from __future__ import annotations

import csv
import json
import os
import re
import uuid
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

BASE = os.getenv("SMARTRUBLE_TEST_URL", "http://127.0.0.1:8765")
ARTIFACTS = Path("browser-artifacts")


def amount(text: str) -> str:
    """Normalize Russian-formatted currency, preserving digits and comma."""
    return re.sub(r"[\s\u00a0\u202f]", "", text).replace("₽", "")


def get_json(context, path: str) -> dict:
    response = context.request.get(BASE + path)
    assert response.status == 200, f"{path}: {response.status} {response.text()}"
    return response.json()


def main() -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    with urlopen(BASE + "/health", timeout=10) as response:
        assert json.load(response)["mode"] == "simulation"

    # A unique estimate avoids interaction with the seeds used by browser_smoke.
    grant_id = "forum-e2e-" + uuid.uuid4().hex[:10]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            channel="chrome", headless=True, args=["--no-sandbox"]
        )
        context = browser.new_context(
            viewport={"width": 1440, "height": 900}, locale="ru-RU",
            accept_downloads=True,
        )
        page = context.new_page()
        javascript_errors = []
        page.on("pageerror", lambda error: javascript_errors.append(str(error)))

        # 1. Create the estimate through the actual HTML form.
        page.goto(BASE + "/app/estimates", wait_until="domcontentloaded")
        page.locator("#grant-name").wait_for()
        page.locator("#grant-name").fill(grant_id)
        # A user only selects categories and types ordinary numbers.
        # No em dash or keyboard currency sign is needed.
        page.locator("#estimate-rows .estimate-category").first.select_option("consumables")
        page.locator("#estimate-rows .estimate-amount").first.fill("50000")
        page.locator("#estimate-add").click()
        page.locator("#estimate-rows .estimate-category").nth(1).select_option("equipment")
        page.locator("#estimate-rows .estimate-amount").nth(1).fill("120000")
        page.locator("#estimate-add").click()
        page.locator("#estimate-rows .estimate-category").nth(2).select_option("services")
        page.locator("#estimate-rows .estimate-amount").nth(2).fill("10000")
        assert amount(page.locator("#estimate-total").inner_text()) == "180000"
        with page.expect_response(
            lambda r: r.url == BASE + "/contracts" and r.request.method == "POST"
        ) as creating:
            page.locator('#estimate-form button[type="submit"]').click()
        created = creating.value
        assert created.status == 200, created.text()
        assert created.json()["grant_id"] == grant_id
        page.wait_for_function(
            "(id) => document.querySelector('#active-grant').value === id", arg=grant_id
        )
        page.locator("#estimate-details").wait_for()
        budget = get_json(context, "/contracts/" + grant_id)
        assert budget["limits"] == {
            "consumables": 50000, "equipment": 120000, "services": 10000
        }, budget
        assert budget["transactions"] == 0
        page.screenshot(path=str(ARTIFACTS / "forum-01-estimate.png"), full_page=True)
        print("FORUM 1/6: estimate created and active budget selected", flush=True)

        # 2. Check a specific two-unit purchase through the visible form.
        page.goto(BASE + "/app/receipts", wait_until="domcontentloaded")
        page.locator("#receipt-form").wait_for()
        page.locator("#merchant").fill("ООО Лаборатория")
        page.locator(".item-name").first.fill("резистор")
        page.locator(".item-qty").first.fill("2")
        page.locator(".item-price").first.fill("1250.50")
        assert amount(page.locator("#receipt-total").inner_text()) == "2501"
        with page.expect_response(
            lambda r: r.url.endswith("/contracts/" + grant_id + "/validate")
            and r.request.method == "POST"
        ) as checking:
            page.locator("#receipt-submit").click()
        first_response = checking.value
        assert first_response.status == 200, first_response.text()
        first = first_response.json()
        assert len(first["items"]) == 1
        assert first["items"][0]["amount"] == 2501
        assert round(first["approved"] + first["review"] + first["personal_pay"], 2) == 2501
        page.locator("#receipt-new").wait_for(state="visible")
        assert page.locator("#receipt-submit").is_disabled()
        assert first["items"][0]["reason"] in page.locator("#receipt-result").inner_text()
        page.screenshot(path=str(ARTIFACTS / "forum-02-receipt.png"), full_page=True)

        # A successful receipt must appear exactly once, despite a locked form.
        audit = get_json(context, "/contracts/" + grant_id + "/audit")
        assert audit["entries"] == 1 and audit["chain_valid"], audit
        page.locator("#receipt-new").click()
        page.locator("#merchant").fill("ООО Лаборатория")
        page.locator(".item-name").first.fill("Лак")
        page.locator(".item-price").first.fill("500")
        assert amount(page.locator("#receipt-total").inner_text()) == "500"
        with page.expect_response(
            lambda r: r.url.endswith("/contracts/" + grant_id + "/validate")
            and r.request.method == "POST"
        ) as reviewing:
            page.locator("#receipt-submit").click()
        second_response = reviewing.value
        assert second_response.status == 200, second_response.text()
        second = second_response.json()
        assert second["items"][0]["name"] == "Лак"
        assert second["items"][0]["reason"] in page.locator("#receipt-result").inner_text()
        page.locator("#receipt-new").wait_for(state="visible")
        print("FORUM 2/6: purchases checked, item-by-item decisions explained", flush=True)

        # 3. Cross-check state against the actual contract and hash-chain log.
        history = get_json(context, "/contracts/" + grant_id + "/history")
        assert history["chain_valid"]
        assert len(history["entries"]) == 2
        assert {record["record"]["receipt_id"] for record in history["entries"]} == {
            first["receipt_id"], second["receipt_id"]
        }
        audit = get_json(context, "/contracts/" + grant_id + "/audit")
        assert audit["entries"] == 2 and audit["chain_valid"]
        budget = get_json(context, "/contracts/" + grant_id)
        assert budget["transactions"] == 2
        assert round(sum(budget["spent"].values()), 2) == round(
            first["approved"] + second["approved"], 2
        ), "Only approved items may consume grant budget"
        print("FORUM 3/6: both receipts in audit, no duplicated spend", flush=True)

        # 4. The same record must be searchable in the UI, with safe CSV export.
        page.goto(BASE + "/app/history", wait_until="domcontentloaded")
        page.locator("#history-search").wait_for()
        page.wait_for_function(
            "() => document.querySelectorAll('.history-view').length === 2"
        )
        page.locator("#history-search").fill("Лак")
        page.wait_for_function(
            "() => document.querySelectorAll('.history-view').length === 1"
        )
        assert page.locator("#history-stat-count").inner_text().strip() == "1"
        assert second["receipt_id"] in page.locator("#history-detail").inner_text()
        assert second["items"][0]["reason"] in page.locator("#history-detail").inner_text()
        assert "Цепочка записей проверена" in page.locator("#audit-state").inner_text()
        page.locator("#history-status").select_option(second["status"])
        assert page.locator(".history-view").count() == 1
        with page.expect_download() as downloading:
            page.locator("#history-export").click()
        download = downloading.value
        assert download.suggested_filename == "smartruble-operations.csv"
        destination = ARTIFACTS / "forum-history-filtered.csv"
        download.save_as(str(destination))
        with destination.open("r", encoding="utf-8-sig", newline="") as handle:
            lines = list(csv.reader(handle, delimiter=";"))
        assert len(lines) == 2, lines
        assert second["receipt_id"] in lines[1], lines
        assert first["receipt_id"] not in lines[1], lines
        page.screenshot(path=str(ARTIFACTS / "forum-03-history.png"), full_page=True)
        print("FORUM 4/6: search, status filter and Excel CSV match the audit", flush=True)

        # 5. Synthetic anomaly ranking (a separate dataset, not these receipts).
        page.goto(BASE + "/app/antifraud", wait_until="domcontentloaded")
        page.locator("#fraud-seed").fill("3")
        page.locator("#fraud-run").click()
        page.locator(".af-rank-item").first.wait_for(timeout=25000)
        assert page.locator(".af-rank-item").count() == 10
        page.locator(".af-rank-item").nth(1).click()
        assert page.locator(".af-signal").count() == 6
        assert "не вероятность мошенничества" in page.locator("#page").inner_text().lower()
        page.screenshot(path=str(ARTIFACTS / "forum-04-anomalies.png"), full_page=True)
        print("FORUM 5/6: reproducible synthetic anti-fraud analysis", flush=True)

        # 6. Three real server-side economic scenarios with explicit assumptions.
        page.goto(BASE + "/app/economics", wait_until="domcontentloaded")
        page.locator("#econ-submit").click()
        page.locator(".econ-chart").wait_for(timeout=25000)
        assert page.locator(".econ-case").count() == 3
        assert page.locator(".econ-table tbody tr").count() == 3
        assert "250000" in amount(page.locator(".econ-result-intro h3").inner_text())
        assert "4,07" in page.locator("#econ-result").inner_text()
        page.screenshot(path=str(ARTIFACTS / "forum-05-economics.png"), full_page=True)
        print("FORUM 6/6: economics scenarios, chart and payback calculated", flush=True)

        assert not javascript_errors, "Unhandled browser JavaScript errors: " + repr(javascript_errors)
        context.close()
        browser.close()
    print("FORUM JOURNEY PASS — UI -> API -> audit -> CSV -> analytics", flush=True)


if __name__ == "__main__":
    main()
