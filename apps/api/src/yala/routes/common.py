"""What every route shares: ledger and sink access, and the request field types.

Validation lives here rather than in each router so one rule is enforced once; reporting a failure
is :mod:`yala.routes.errors`.
"""

from __future__ import annotations

import datetime as dt
import re
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, Field

from yala import config
from yala.dates import month_of
from yala.ledger import Ledger
from yala.ledger.constants import ASSETS, LIABILITIES
from yala.ledger.naming import compose
from yala.ledger.sweep import reconcile_months
from yala.routes.errors import invalid
from yala.sink import FileLedgerSink
from yala.text import collapse

NAME_RE = re.compile(r"^[A-Za-z0-9:-]+$")
LEAF_RE = re.compile(r"^[A-Za-z0-9-]+$")
# One account-path segment: beancount requires each to start uppercase (lowercase = parse error).
SEGMENT_RE = re.compile(r"^[A-Z][A-Za-z0-9-]*$")
# A name as a person types it. Composition treats anything else as a separator and drops it, so a
# name carrying one is refused rather than silently cleaned into a different name.
TYPED_NAME_RE = re.compile(r"^[A-Za-z0-9 ]+$")

# Sanity ceilings, defense-in-depth rather than domain rules. Money stays well below float's
# precision cliff (2^53 cents) so cent-exact arithmetic stays exact, and leg lists are capped so one
# request cannot balloon a ledger file.
MAX_AMOUNT = 1e12
MAX_TEXT = 200
MAX_LEAF = 60
MAX_LEGS = 100

# Dates outside this window are a typo (a mistyped year), not a ledger a person keeps.
MIN_DATE = dt.date(1900, 1, 1)
MAX_DATE = dt.date(2100, 12, 31)


# --- request field types ---


def _normalize(value: str) -> str:
    text = collapse(value)
    if len(text) > MAX_TEXT:
        raise ValueError(f"must be at most {MAX_TEXT} characters")
    return text


def _clean_text(value: str) -> str:
    text = _normalize(value)
    if not text:
        raise ValueError("must not be blank")
    return text


def _clean_optional_text(value: object) -> str | None:
    """Blank means "not given": a form binds an empty string to an untouched input."""
    if value is None:
        return None
    return _normalize(str(value)) or None


# A transaction/transfer amount must be positive; a credit or payroll line item may be zero but
# never negative. Both are finite and bounded.
Amount = Annotated[float, Field(gt=0, le=MAX_AMOUNT, allow_inf_nan=False)]
NonNegAmount = Annotated[float, Field(ge=0, le=MAX_AMOUNT, allow_inf_nan=False)]
# A balance may be negative, but only for a liability: that is how a credit is stated. Which
# accounts may go below zero is `stored_amount`'s rule, so the bound here is only the magnitude.
SignedAmount = Annotated[float, Field(ge=-MAX_AMOUNT, le=MAX_AMOUNT, allow_inf_nan=False)]
Text = Annotated[str, AfterValidator(_clean_text)]
# The optional counterpart: blank or missing both arrive as None.
OptionalText = Annotated[str | None, BeforeValidator(_clean_optional_text)]


# --- ledger access ---


def ledger() -> Ledger:
    return Ledger(config.MAIN_LEDGER).load()


def sink() -> FileLedgerSink:
    return FileLedgerSink(config.LEDGER_DIR)


def dec(value: float) -> Decimal:
    """Decimal from a request float, via str so 19.99 doesn't become 19.9900000001."""
    return Decimal(str(value))


def ok(message: str, **extra) -> dict:
    """A write endpoint's success body: ``{"ok": True, "message": ...}`` plus any extras."""
    return {"ok": True, "message": message, **extra}


def reconcile_sweeps(*dates: dt.date | None) -> None:
    """Re-derive passthrough sweeps for every month a just-written entry touched."""
    months = {month_of(d) for d in dates if d is not None}
    if months:
        reconcile_months(sink(), months)


# --- shared validation ---


def valid_name(value: str) -> str:
    """An existing account or category the client picked from a list we sent it."""
    if not NAME_RE.match(value) or len(value) > MAX_TEXT:
        raise invalid(f"invalid account/category name: {value!r}")
    return value


def valid_money_account(value: str) -> str:
    """A leg that moves money names a balance-sheet account, never an Expenses/Income one: that is
    what separates a transfer or a reimbursement from spending.
    """
    valid_name(value)
    if not value.startswith((ASSETS, LIABILITIES)):
        raise invalid(f"{value!r} must be an asset or liability account")
    return value


def valid_leaf(value: str, field: str = "account name") -> str:
    """A bare account leaf the client sent back to us, such as an employer it picked from a list."""
    if not 0 < len(value) <= MAX_LEAF or not LEAF_RE.match(value):
        raise invalid(f"{field} must be 1-{MAX_LEAF} letters, numbers, or hyphens: {value!r}")
    return value


def valid_typed_name(typed: str, field: str) -> str:
    """A name as a person typed it, whether it composes an account segment or only shortens one.

    One rule for every name in the app: letters, digits and spaces. Composition would treat anything
    else as a separator and drop it, and a short form has no reason to allow more than the name it
    stands in for.
    """
    if not TYPED_NAME_RE.match(typed):
        raise invalid(f"{field} can only contain letters, numbers and spaces")
    return typed


def valid_segment(segment: str, field: str, typed: str) -> str:
    """A composed account segment: legal for beancount, and within the length ceiling.

    Reported against the field the words came from rather than as a bad account name, since the
    caller typed words and never saw the segment they compose to. Length is reported apart from the
    character rule: a name can be legal and still be too long.
    """
    if len(segment) > MAX_LEAF:
        raise invalid(f"{field} must be at most {MAX_LEAF} characters")

    if not segment or not SEGMENT_RE.match(segment):
        raise invalid(f"{field} can only contain letters, numbers and spaces")
    return segment


def valid_composed_leaf(typed: str, field: str) -> str:
    """The account segment ``typed`` names, composed by the server so a person can write a name the
    way they say it."""
    valid_typed_name(typed, field)

    return valid_segment(compose(typed), field, typed)


def valid_label(value: str, field: str = "contribution option") -> str:
    """A contribution label. Shown as typed rather than composed into a path, so it takes a space
    but not whitespace at large: labels are written as one comma-joined value on a single ledger
    line, which a newline would break and a comma would split in two.
    """
    if not 0 < len(value) <= MAX_LEAF or not TYPED_NAME_RE.match(value):
        raise invalid(
            f"{field} must be 1-{MAX_LEAF} letters, digits or spaces, with no comma: {value!r}"
        )
    return value


def parse_date(value: str | None) -> dt.date:
    """Parse an ISO date, defaulting to today: the date is the one field a form may leave to the
    server.
    """
    if not value:
        return dt.date.today()

    try:
        date = dt.date.fromisoformat(value)

    except ValueError:
        raise invalid(f"invalid date: {value!r}")

    if not MIN_DATE <= date <= MAX_DATE:
        raise invalid(
            f"date must be between {MIN_DATE.isoformat()} and {MAX_DATE.isoformat()}: {value!r}"
        )
    return date


def parse_date_opt(value: str | None) -> dt.date | None:
    """Parse an ISO date, or ``None`` when omitted — an update with no date keeps its own."""
    return parse_date(value) if value else None
