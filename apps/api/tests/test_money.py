"""Money rounding: the single 2dp banker's-rounding helper shared by schema + sink."""

from __future__ import annotations

from decimal import Decimal

from yala.money import money, round_cents


def test_round_cents_uses_bankers_rounding():
    # .5 rounds to the nearest even last digit (ROUND_HALF_EVEN).
    assert round_cents(Decimal("0.125")) == Decimal("0.12")  # 2 is even
    assert round_cents(Decimal("0.135")) == Decimal("0.14")  # rounds to even 4
    assert round_cents(Decimal("-0.125")) == Decimal("-0.12")


def test_schema_money_and_round_cents_agree():
    # schema.money and the sink both quantize through round_cents, so the reported value and the
    # ledger write never diverge.
    for v in ("0.125", "0.135", "2.005", "10.005", "-0.125"):
        assert money(Decimal(v)) == float(round_cents(Decimal(v)))
        assert Decimal(str(money(Decimal(v)))) == round_cents(Decimal(v))


def test_money_returns_float():
    assert isinstance(money(Decimal("1.00")), float)
    assert money(3) == 3.0
