"""Single source of truth for money rounding."""

from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal

CENTS = Decimal("0.01")


def round_cents(value: Decimal | int | float | str) -> Decimal:
    """Quantize ``value`` to cents using banker's rounding (ROUND_HALF_EVEN)."""
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_EVEN)
