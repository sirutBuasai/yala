"""Single source of truth for money rounding."""

from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal

CENTS = Decimal("0.01")


def round_cents(value: Decimal | int | float | str) -> Decimal:
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_EVEN)


def money(value: Decimal | int | float) -> float:
    return float(round_cents(value))
