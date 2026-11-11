r"""Prepare disposable synthetic receipts on an ALREADY RUNNING local server.

Windows:
  .venv\Scripts\python.exe scripts\prepare_forum_demo.py
Only localhost is allowed. Server keeps state in RAM; restart clears it.
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid


def request(base, route, payload=None):
    url = base + route
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    method = "POST" if data is not None else "GET"
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {route}: HTTP {exc.code}: {detail}") from exc


def prepare(base, grant=None):
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1") \
            or parsed.username or parsed.password or parsed.path not in ("", "/") \
            or parsed.query or parsed.fragment:
        raise ValueError("Use only http://127.0.0.1:PORT or http://localhost:PORT")
    base = base.rstrip("/")
    grant = grant or ("forum-v05-" + uuid.uuid4().hex[:8])
    if not grant.startswith("forum-v05-"):
        raise ValueError("Grant ID must start with forum-v05-")
    health = request(base, "/health")
    if health.get("mode") != "simulation":
        raise RuntimeError("Not the SmartRubleAI simulation server")
    contract = request(base, "/contracts", {
        "grant_id": grant, "text": "Услуги - 300"
    })
    if contract["limits"] != {"services": 300}:
        raise RuntimeError("Unexpected demonstration budget")
    receipts = []
    for i, price in enumerate((175, 200), 1):
        result = request(base, "/contracts/" + urllib.parse.quote(grant, safe="") + "/validate", {
            "id": "forum-check-" + grant + f"-{i}",
            "merchant": "Учебный магазин",
            "items": [{"name": "arduino uno r3", "price": price, "qty": 1}],
        })
        if len(result["items"]) != 1 or result["items"][0]["decision"] != "REVIEW":
            raise RuntimeError("The current ML model did not put the demo item into REVIEW; "
                               "choose another ambiguous item. Result: " + str(result))
        receipts.append(result["receipt_id"])
    queue = request(base, "/contracts/" + urllib.parse.quote(grant, safe="") + "/reviews")
    if queue["pending"] != 2:
        raise RuntimeError("Expected exactly two undecided items")
    return {"grant_id": grant, "created_receipts": receipts, "pending": 2,
            "grant_url": base + "/app/history", "mode": "simulation"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--grant-id", default=None)
    args = parser.parse_args()
    print(json.dumps(prepare(args.base_url, args.grant_id), ensure_ascii=False, indent=2))
    print("DEMO READY — select the printed grant_id in the top bar.")


if __name__ == "__main__":
    main()
