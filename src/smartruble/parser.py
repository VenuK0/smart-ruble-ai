"""Разбор сметы в структурированные параметры контракта.

В прототипе — детерминированный разбор по шаблону «Статья — сумма». В продукте на это место ставится LLM
(GigaChat и т. п.), но LLM только ИЗВЛЕКАЕТ параметры в JSON; сам контракт собирается из проверенного шаблона.
"""
from __future__ import annotations
import re

ARTICLE_KEYWORDS = {
    "consumables": ("расходн", "материал", "реактив", "комплектующ"),
    "equipment": ("оборудован", "прибор", "техник"),
    "literature_software": ("литератур", "книг", "программн", "лиценз", "подписк", "публикац", "конференц"),
    "services": ("услуг", "аренд", "хостинг", "сервер", "доставк", "облач"),
}
LINE = re.compile(r"^\s*[-•*\d.)]*\s*(?P<name>[^:—–\-\d][^:—–]*?)\s*[:—–-]\s*(?P<sum>[\d\s .,]+)\s*(?:₽|руб\.?|р\.?)?\s*$", re.I)


def parse_estimate(text: str) -> dict:
    """Возвращает {категория: лимит}. Нераспознанные строки попадают в 'unparsed' для ручной проверки."""
    limits, unparsed = {}, []
    for raw in text.splitlines():
        if not raw.strip():
            continue
        m = LINE.match(raw)
        if not m:
            unparsed.append(raw.strip())
            continue
        name = m.group("name").lower()
        num = re.sub(r"[^\d,]", "", m.group("sum")).replace(",", ".")
        if not num:
            unparsed.append(raw.strip())
            continue
        cat = next((c for c, kws in ARTICLE_KEYWORDS.items() if any(k in name for k in kws)), None)
        if cat is None:
            unparsed.append(raw.strip())
            continue
        limits[cat] = limits.get(cat, 0.0) + float(num)
    return {"limits": limits, "unparsed": unparsed}
