"""User settings: the handful of figures the ledger can't derive, stored in the ledger itself.

Most of what the dashboard shows is computed from transactions and balances. A few numbers are
*assumptions* rather than facts — the withdrawal rate behind a financial-independence target, or
the age you're aiming to retire at — so they have to be stated. They live as ``custom`` directives
in the ledger rather than in a config file, so they version with the data they describe and stay
readable without this app::

    2026-01-01 custom "yala-setting" "swr" 4.0
    2026-01-01 custom "yala-setting" "retire-age" 55

Directives are **dated and superseding**: the latest one for a key wins, so changing a rate leaves
the old value in place as history instead of silently restating the past.

:data:`SETTINGS` is the single source of truth for every key — its type, default, bounds, and
label. Reads, writes, API validation, and the ``data.json`` contract all derive from it, so adding
a setting means adding one spec entry.
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
    kind: str  # "percent" | "age" | "year" | "months" — drives coercion and how the UI renders it
    minimum: Decimal
    maximum: Decimal
    default: Decimal | None  # None = no sensible default; dependent features stay hidden
    help: str

    @property
    def is_integer(self) -> bool:
        """Ages, years, and month counts are whole numbers; rates carry decimals."""
        return self.kind in ("age", "year", "months")


SETTINGS: tuple[SettingSpec, ...] = (
    SettingSpec(
        key="swr",
        label="Withdrawal rate",
        kind="percent",
        minimum=Decimal("0.1"),
        maximum=Decimal(20),
        default=Decimal(4),
        help=(
            "Share of the portfolio you plan to withdraw each year. Sets the financial-"
            "independence target: annual spending divided by this rate. 4% is the common default."
        ),
    ),
    SettingSpec(
        key="real-return",
        label="Expected real return",
        kind="percent",
        minimum=Decimal(0),
        maximum=Decimal(20),
        default=Decimal(5),
        help=(
            "Long-run return above inflation, used to project what today's balance grows into "
            "without further contributions."
        ),
    ),
    SettingSpec(
        key="retire-age",
        label="Target retirement age",
        kind="age",
        minimum=Decimal(18),
        maximum=Decimal(100),
        default=Decimal(60),
        help="The age the projection aims at.",
    ),
    SettingSpec(
        key="runway-target",
        label="Target cash runway",
        kind="months",
        minimum=Decimal(1),
        maximum=Decimal(120),
        default=Decimal(6),
        help=(
            "Months of spending you want held in cash. Marks the threshold on the runway gauge; "
            "three to six months is the usual advice."
        ),
    ),
    SettingSpec(
        key="birth-year",
        label="Birth year",
        kind="year",
        minimum=Decimal(1900),
        maximum=Decimal(2100),
        default=None,
        help=(
            "Only used to work out how many years remain until your target age. Leave this unset "
            "and age-based projections stay hidden."
        ),
    ),
)

SETTINGS_BY_KEY: dict[str, SettingSpec] = {s.key: s for s in SETTINGS}


def coerce(key: str, value: object) -> Decimal:
    """Validate ``value`` for ``key`` and return it as a :class:`Decimal`.

    Shared by every entry point — the ledger reader, the write sink, and the API — so a figure
    that's rejected in a form is equally rejected when hand-written into the ledger. Raises
    ``KeyError`` for an unknown key and ``ValueError`` with a user-facing message otherwise.
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
    """Render a bound without a trailing ``.0``, so a message reads "between 18 and 100"."""
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
        """Every explicitly-set value, keyed by setting.

        Directives are visited in ledger order (beancount sorts by date), so a later directive for
        the same key supersedes an earlier one. An unparseable or unknown entry is skipped rather
        than raising: the ledger is hand-editable, and one bad line shouldn't blank the dashboard.
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
