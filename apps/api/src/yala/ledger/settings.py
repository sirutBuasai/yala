"""User settings: the handful of figures the ledger can't derive, stored in the ledger itself.

Held as ``custom`` directives rather than in a config file, so they version with the data they
describe::

    <date> custom "yala-setting" "<key>" <value>

Directives are **dated and superseding**: the latest one for a key wins, so a change leaves the old
value behind as history. :data:`SETTINGS` is the single source of truth for every key.
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
    # Nominal, not real: the return people actually know is the market's headline figure.
    # The real rate every projection compounds at is derived from this and `inflation` — see
    # the Fisher relation in the frontend's `realRate`, exact rather than a subtraction.
    SettingSpec(
        key="nominal-return",
        label="Expected nominal return",
        kind="percent",
        minimum=Decimal(0),
        maximum=Decimal(20),
        default=Decimal(8),
        help="Expected annual investment return adjusted with inflation.",
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
    # logged": the figure is data-derived, so a static default here would be a guess, and
    # the form seeds the control from the data instead.
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
    """Validate ``value`` for ``key`` and return it as a :class:`Decimal`.

    Shared by the ledger reader, the write sink and the API, so a figure rejected in a form is
    equally rejected when hand-written into the ledger. Raises ``KeyError`` for an unknown key and
    ``ValueError`` with a user-facing message otherwise.
    """
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


def format_value(spec: SettingSpec, value: Decimal) -> str:
    """The value as it should appear in the ledger — whole for ages/years, decimal for rates."""
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
        """Every explicitly-set value, keyed by setting, the latest directive winning.

        An unparseable or unknown entry is skipped rather than raising: the ledger is hand-editable,
        and one bad line shouldn't blank the dashboard.
        """
        out: dict[str, Decimal] = {}

        for entry in self._directives():
            key, value = _pair(entry)
            if key is None:
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
