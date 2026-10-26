"""REST API прототипа SmartRubleAI (симуляция контракта целевых средств).
Ядро (parser/classifier/contract/antifraud) покрыто тестами; API проверен вручную через Swagger UI (/docs).
Запуск: uvicorn smartruble.api:app --app-dir src"""
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .parser import parse_estimate
from .classifier import ItemClassifier
from .contract import SmartContract
from .data import make_items

app = FastAPI(title="SmartRubleAI prototype", version="0.1.0")
_rows = make_items(300, 0)
CLF = ItemClassifier().fit([r[0] for r in _rows], [r[1] for r in _rows])
CONTRACTS: dict[str, SmartContract] = {}


class EstimateIn(BaseModel):
    grant_id: str
    text: str


class Item(BaseModel):
    name: str
    qty: float = 1
    price: float


class ReceiptIn(BaseModel):
    id: str = Field(default_factory=lambda: f"rcpt-{uuid.uuid4().hex[:8]}")
    merchant: str
    items: list[Item]


@app.get("/")
def root():
    return {"status": "online", "system": "SmartRubleAI", "docs": "/docs"}


@app.post("/contracts")
def create_contract(body: EstimateIn):
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
    return c.validate(receipt.model_dump())


@app.get("/contracts/{grant_id}/audit")
def audit(grant_id: str):
    c = CONTRACTS.get(grant_id)
    if c is None:
        raise HTTPException(404, "Контракт не найден")
    return {"chain_valid": c.verify_log(), "entries": len(c.log), "spent": c.spent}
