"""REST API прототипа SmartRubleAI (симуляция контракта целевых средств).
Ядро (parser/classifier/contract/antifraud) покрыто тестами; API проверен вручную через Swagger UI (/docs).
Запуск: uvicorn smartruble.api:app --app-dir src"""
import uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, ConfigDict
from .parser import parse_estimate
from .classifier import ItemClassifier
from .contract import SmartContract
from .data import make_items, make_transactions
from .antifraud import detect
from .economics import scenario

app = FastAPI(title="SmartRubleAI Research Prototype", version="0.2.0-dev",
              description="Симуляция на синтетических данных. Не подключено к инфраструктуре цифрового рубля.")
_rows = make_items(300, 0)
CLF = ItemClassifier().fit([r[0] for r in _rows], [r[1] for r in _rows])
CONTRACTS: dict[str, SmartContract] = {}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class EstimateIn(StrictModel):
    grant_id: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=30000)


class Item(StrictModel):
    name: str = Field(min_length=1, max_length=250)
    qty: float = Field(default=1, gt=0, le=100000, allow_inf_nan=False)
    price: float = Field(gt=0, le=1000000000, allow_inf_nan=False)


class ReceiptIn(StrictModel):
    id: str = Field(default_factory=lambda: f"rcpt-{uuid.uuid4().hex[:12]}", min_length=1, max_length=128)
    merchant: str = Field(min_length=1, max_length=200)
    items: list[Item] = Field(min_length=1, max_length=100)


@app.get("/")
def root():
    return {"status": "online", "system": "SmartRubleAI", "docs": "/docs", "demo": "/demo",
            "notice": "prototype simulation — no real digital-ruble payments"}


@app.post("/contracts")
def create_contract(body: EstimateIn):
    if body.grant_id in CONTRACTS:
        raise HTTPException(409, "Контракт уже существует")
    parsed = parse_estimate(body.text)
    if not parsed["limits"]:
        raise HTTPException(422, "В смете не найдено ни одной статьи")
    CONTRACTS[body.grant_id] = SmartContract(limits=parsed["limits"], classifier=CLF)
    return {"grant_id": body.grant_id, **parsed}


@app.post("/contracts/{grant_id}/validate")
def validate(grant_id: str, receipt: ReceiptIn):
    c = CONTRACTS.get(grant_id)
    if c is None:
        raise HTTPException(404, "Контракт не найден")
    try:
        return c.validate(receipt.model_dump())
    except ValueError as exc:
        raise HTTPException(409 if "уже использован" in str(exc) else 422, str(exc)) from exc


@app.get("/contracts/{grant_id}/audit")
def audit(grant_id: str):
    c = CONTRACTS.get(grant_id)
    if c is None:
        raise HTTPException(404, "Контракт не найден")
    return {"chain_valid": c.verify_log(), "entries": len(c.log), "spent": c.spent}


@app.get("/health")
def health():
    return {"status": "ok", "mode": "simulation"}


@app.get("/demo", response_class=HTMLResponse, include_in_schema=False)
def demo():
    path = Path(__file__).parent / "web" / "index.html"
    if not path.is_file():
        raise HTTPException(503, "Демо-интерфейс отсутствует")
    return path.read_text(encoding="utf-8")


@app.get("/contracts")
def list_contracts():
    return {"contracts": [
        {"grant_id": gid, "limits": contract.limits, "spent": contract.spent,
         "transactions": len(contract.processed_receipts)}
        for gid, contract in CONTRACTS.items()
    ]}


@app.get("/contracts/{grant_id}")
def contract_info(grant_id: str):
    contract = CONTRACTS.get(grant_id)
    if contract is None:
        raise HTTPException(404, "Контракт не найден")
    return {"grant_id": grant_id, "limits": contract.limits, "spent": contract.spent,
            "remaining": {cat: contract.remaining(cat) for cat in contract.limits},
            "transactions": len(contract.processed_receipts),
            "audit_valid": contract.verify_log()}


@app.get("/contracts/{grant_id}/history")
def history(grant_id: str):
    contract = CONTRACTS.get(grant_id)
    if contract is None:
        raise HTTPException(404, "Контракт не найден")
    return {"chain_valid": contract.verify_log(),
            "entries": [{"ts": entry["ts"], "record": entry["record"]}
                        for entry in contract.log[-100:]]}


@app.get("/antifraud/demo")
def antifraud_demo(seed: int = 0):
    if not 0 <= seed <= 10000:
        raise HTTPException(422, "Неверный seed")
    transactions, planted = make_transactions(seed=seed)
    ranked = detect(transactions, seed=seed)
    return {"mode": "synthetic", "transactions": len(transactions),
            "merchant_count": len(ranked), "planted_count": len(planted),
            "top": [{"merchant": merchant, "anomaly_score": round(float(score), 4),
                     "planted_anomaly": merchant in planted}
                    for merchant, score in ranked[:10]],
            "warning": "Синтетический сценарий, не показатели реального мошенничества"}


class EconomicsIn(StrictModel):
    workflows_per_year: int = Field(ge=1, le=100000000)
    manual_minutes: float = Field(gt=0, le=100000)
    automated_minutes: float = Field(ge=0, le=100000)
    hourly_cost_rub: float = Field(gt=0, le=100000000)
    maintenance_rub_year: float = Field(ge=0, le=100000000000)
    development_rub: float = Field(ge=0, le=100000000000)


@app.post("/economics/scenario")
def economics_calculator(body: EconomicsIn):
    try:
        return scenario(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
