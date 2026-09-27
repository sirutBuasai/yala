"""Figures the ledger can't derive, as dated, superseding directives that version with the data::

<date> custom "yala-setting" "<key>" <value>
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING

from beancount.core import data

if TYPE_CHECKING:
    from yala.ledger.core import Ledger

#: ``custom`` directive type that marks one of our settings.
SETTING_TYPE = "yala-setting"
#: The value a directive states to put a setting back on its default. A directive, not a deletion,
#: so the history of what was stated survives and the latest line still wins.
DEFAULT_TOKEN = "default"


@dataclass(frozen=True)
class SettingSpec:
    """One settable figure: how to parse it, what it defaults to, and what it's allowed to be."""

    key: str
    label: str  # how the field is named in an error message and in the UI
    kind: str  # "percent"|"age"|"year"|"months"|"money" — drives coercion and how the UI renders it
    minimum: Decimal
    maximum: Decimal
    default: Decimal | None  # None = no sensible default; dependent features stay hidden
    help: str

    @property
    def is_integer(self) -> bool:
        """Ages, years, month counts and planning amounts are whole; only rates carry decimals."""
        return self.kind in ("age", "year", "months", "money")


SETTINGS: tuple[SettingSpec, ...] = (
    # Floored well above zero: the FI number is spending divided by this, so a rate near
    # zero puts the target in the tens of millions and takes the value axis with it.
    SettingSpec(
        key="swr",
        label="Withdrawal rate",
        kind="percent",
        minimum=Decimal("1.5"),
        maximum=Decimal(20),
        default=Decimal(4),
        help="Annual withdrawal rate from investment after retirement.",
    ),
    # Nominal, the figure people know; the real rate is derived with ``inflation``.
    SettingSpec(
        key="nominal-return",
        label="Expected nominal return",
        kind="percent",
        minimum=Decimal(0),
        maximum=Decimal(20),
        default=Decimal(8),
        help="Expected annual investment return before inflation is taken out.",
    ),
    SettingSpec(
        key="inflation",
        label="Expected inflation",
        kind="percent",
        minimum=Decimal(0),
        maximum=Decimal(15),
        default=Decimal(3),
        help="Long-run annual inflation rate.",
    ),
    # Spread around the expected return, not a return: the projection's market-risk band draws each
    # simulated year's real return from a normal distribution this wide.
    SettingSpec(
        key="volatility",
        label="Return volatility",
        kind="percent",
        minimum=Decimal(0),
        maximum=Decimal(30),
        default=Decimal(15),
        help=(
            "How far a year's return strays from the expected one: around 15% for a mostly stock "
            "portfolio, 10% for 60/40."
        ),
    ),
    SettingSpec(
        key="retire-age",
        label="Target retirement age",
        kind="age",
        minimum=Decimal(18),
        maximum=Decimal(100),
        default=Decimal(60),
        help="The age you stop contributing and start withdrawing money.",
    ),
    SettingSpec(
        key="runway-target",
        label="Target cash runway",
        kind="months",
        minimum=Decimal(1),
        maximum=Decimal(120),
        default=Decimal(6),
        help="Number of months in spending you want held in liquid assets.",
    ),
    # The two planning amounts. Both default to None, meaning "use what the ledger
    # logged": the figure is data-derived, so a static default would be a guess.
    SettingSpec(
        key="planned-spending",
        label="Planned spending",
        kind="money",
        minimum=Decimal(0),
        maximum=Decimal(500_000),
        default=None,
        help="Projected yearly spending.",
    ),
    SettingSpec(
        key="out-of-pocket",
        label="Out-of-pocket investments",
        kind="money",
        minimum=Decimal(0),
        maximum=Decimal(500_000),
        default=None,
        help="Additional yearly investments out-of-pocket excluding payroll contributions.",
    ),
    SettingSpec(
        key="horizon-age",
        label="Plan horizon age",
        kind="age",
        minimum=Decimal(60),
        maximum=Decimal(110),
        default=Decimal(95),
        help="The age you plan to stop spending money.",
    ),
    SettingSpec(
        key="birth-year",
        label="Birth year",
        kind="year",
        minimum=Decimal(1900),
        maximum=Decimal(2100),
        default=None,
        help=(
            "Your birth year, used for balance growth projection with respect to the target "
            "retirement age."
        ),
    ),
)

SETTINGS_BY_KEY: dict[str, SettingSpec] = {s.key: s for s in SETTINGS}


def coerce(key: str, value: object) -> Decimal:
    """Shared by reader, sink and API, so a figure a form rejects is rejected in the ledger too.
    Raises ``KeyError`` for an unknown key, else ``ValueError`` with a user-facing message."""
    spec = SETTINGS_BY_KEY.get(key)
    if spec is None:
        raise KeyError(key)

    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{spec.label} must be a number")

    if not number.is_finite():
        raise ValueError(f"{spec.label} must be a finite number")

    if spec.is_integer and number != number.to_integral_value():
        raise ValueError(f"{spec.label} must be a whole number")

    if not (spec.minimum <= number <= spec.maximum):
        raise ValueError(
            f"{spec.label} must be between {_plain(spec.minimum)} and {_plain(spec.maximum)}"
        )

    return number.to_integral_value() if spec.is_integer else number


def _plain(number: Decimal) -> str:
    """Render a bound for an error message, without a trailing ``.0``."""
    return str(int(number)) if number == number.to_integral_value() else str(number)


def format_value(spec: SettingSpec, value: Decimal | None) -> str:
    """The value as it should appear in the ledger: whole for ages and years, decimal for rates, and
    the default token for ``None``."""
    if value is None:
        return f'"{DEFAULT_TOKEN}"'
    return str(int(value)) if spec.is_integer else str(value)


class Settings:
    """Query namespace for user settings. Constructed as ``ledger.settings``."""

    def __init__(self, ledger: "Ledger"):
        self._led = ledger

    def _directives(self) -> list[data.Custom]:
        return [
            e for e in self._led.entries if isinstance(e, data.Custom) and e.type == SETTING_TYPE
        ]

    def stored(self) -> dict[str, Decimal]:
        """The latest directive wins, and a default token drops what came before it. Bad entries are
        skipped, so one hand-edited line can't blank the dashboard."""
        out: dict[str, Decimal] = {}

        for entry in self._directives():
            key, value = _pair(entry)
            if key is None:
                continue
            if value == DEFAULT_TOKEN:
                out.pop(key, None)
                continue
            try:
                out[key] = coerce(key, value)
            except (KeyError, ValueError):
                continue

        return out

    def values(self) -> dict[str, Decimal | None]:
        """Effective value of each setting: what's stored, else the spec default (possibly None)."""
        stored = self.stored()
        return {s.key: stored.get(s.key, s.default) for s in SETTINGS}


def _pair(entry: data.Custom) -> tuple[str | None, object]:
    """The ``(key, value)`` a settings directive carries, or ``(None, None)`` if malformed."""
    values = [v.value for v in (entry.values or [])]
    if len(values) != 2 or not isinstance(values[0], str):
        return None, None
    return values[0], values[1]
