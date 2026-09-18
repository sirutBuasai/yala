"""Composing a single beancount directive as text.

Written as text rather than through beancount's printer wherever the file's own formatting matters:
an aligned amount column, a metadata line, a year-file header.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from beancount.core import data
from beancount.core.amount import Amount

from yala.ledger.constants import BALANCE, DEFAULT_CURRENCY, LIABILITIES
from yala.text import single_line

#: Human title per year-file subdirectory, so a newly created year file opens with a heading.
_YEAR_TITLES = {
    "spending": "Spending transactions",
    "income": "Income",
    "transfers": "Transfers",
}

#: Year files sectioned by month rather than opened with a year title: the balance files, where a
#: month's snapshots are read together (see :func:`yala.ledger.placement.month_header`).
MONTHLY = frozenset({"assets", "liabilities"})


def stored_amount(account: str, amount: Decimal) -> Decimal:
    """The signed figure a ``balance`` assertion carries for ``account``.

    A liability is passed in the way a statement reads it — owed positive, a credit negative — and
    beancount keeps that inverted, so the sign is flipped rather than forced. Forcing it made a
    credit impossible to state: an overpaid card came back as more owed.

    Raises for a negative asset, which has no meaning.
    """
    if account.startswith(LIABILITIES):
        return -amount
    if amount < 0:
        raise ValueError(f"{account} cannot hold a negative balance ({amount})")
    return amount


def posting(account: str, number: Decimal, meta: dict | None = None) -> data.Posting:
    """A plain USD posting, for an entry built through beancount's own printer."""
    return data.Posting(
        account,
        Amount(number, DEFAULT_CURRENCY),
        cost=None,
        price=None,
        flag=None,
        meta=meta or None,
    )


def meta_line(key: str, value: str) -> str:
    """One indented ``key: "value"`` metadata line.

    A quote or backslash must be escaped: unescaped, it ends the string early and the file no longer
    parses. A newline is the opposite hazard — beancount accepts it inside the quotes, so a strict
    reload passes and the file silently gains a line."""
    escaped = single_line(str(value), key).replace("\\", "\\\\").replace('"', '\\"')
    return f'  {key}: "{escaped}"'


def meta_lines(meta: dict[str, str] | None) -> str:
    """Every metadata line for a directive, each on its own line beneath it."""
    return "".join(f"\n{meta_line(k, v)}" for k, v in (meta or {}).items())


def balance_directive(date: dt.date, account: str, amount: Decimal, entry_id: str) -> str:
    """A ``balance`` assertion plus the ``id`` meta that makes it addressable by locator.

    Without the id the only handle is the source line, which shifts whenever anything above it in
    the file changes."""
    return (
        f"{date.isoformat()} {BALANCE} {account}    {amount:,.2f} {DEFAULT_CURRENCY}\n"
        f'  id: "{entry_id}"'
    )


def year_header(subdir: str, year: int) -> str | None:
    """The heading a newly created year file opens with, or ``None`` where its months head their own
    sections instead."""
    title = _YEAR_TITLES.get(subdir)

    return f"; {title} for {year}" if title else None


def balance_subdir(account: str) -> str:
    """Which balance file a snapshot of ``account`` belongs in; the two sides of the sheet are kept
    apart."""
    return "liabilities" if account.startswith(LIABILITIES) else "assets"
