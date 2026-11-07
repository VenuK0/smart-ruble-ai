"""Оценка сценариев экономической эффективности — НЕ результат пилотного внедрения."""
from __future__ import annotations
from decimal import Decimal, InvalidOperation


def _positive(value, label: str, allow_zero: bool = False) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(label + ": неверное число") from exc
    if not number.is_finite() or number < 0 or (number == 0 and not allow_zero):
        raise ValueError(label + ": требуется положительное конечное число")
    return number


def scenario(
    workflows_per_year: int,
    manual_minutes: float,
    automated_minutes: float,
    hourly_cost_rub: float,
    maintenance_rub_year: float,
    development_rub: float,
) -> dict:
    """Расчёт только по пользовательским предположениям, без измерений эффективности."""
    n = _positive(workflows_per_year, "Количество процессов")
    before = _positive(manual_minutes, "Время ручной обработки")
    after = _positive(automated_minutes, "Время с сервисом", allow_zero=True)
    rate = _positive(hourly_cost_rub, "Стоимость часа")
    maintenance = _positive(maintenance_rub_year, "Эксплуатационные расходы", allow_zero=True)
    development = _positive(development_rub, "Разработка", allow_zero=True)
    if after > before:
        raise ValueError("Время с сервисом не может превышать ручное в сценарии экономии")
    saved_minutes = before - after
    hours = n * saved_minutes / Decimal(60)
    gross = hours * rate
    annual_net = gross - maintenance
    payback = (development / annual_net if annual_net > 0 else None)
    saving_per_operation = saved_minutes / Decimal(60) * rate
    threshold = (maintenance / saving_per_operation if saving_per_operation > 0 else None)
    result = {
        "mode": "illustrative_assumptions",
        "workflows_per_year": int(n),
        "hours_saved_per_year": round(float(hours), 2),
        "gross_labor_value_rub_year": round(float(gross), 2),
        "maintenance_rub_year": float(maintenance),
        "net_effect_rub_year": round(float(annual_net), 2),
        "development_rub": float(development),
        "payback_years": round(float(payback), 2) if payback is not None else None,
        "breakeven_workflows_per_year": round(float(threshold), 1) if threshold is not None else None,
        "disclaimer": "Все параметры задаются как предположения; это не доказанная экономия или реальный пилот.",
    }
    return result


if __name__ == "__main__":
    for count in (2000, 5000, 10000):
        print(scenario(count, 20, 8, 450, 200000, 1018000))
