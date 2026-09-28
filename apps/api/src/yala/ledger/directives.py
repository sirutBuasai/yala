"""Directives written as text where the file's own formatting matters."""

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
    """A liability is passed owed-positive and flipped, not forced, which made a credit impossible.
    Raises for a negative asset."""
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
    """Quotes and backslashes are escaped, or the string ends early. A newline passes a strict
    reload yet silently adds a line."""
    escaped = single_line(str(value), key).replace("\\", "\\\\").replace('"', '\\"')
    return f'  {key}: "{escaped}"'


def meta_lines(meta: dict[str, str] | None) -> str:
    return "".join(f"\n{meta_line(k, v)}" for k, v in (meta or {}).items())


def balance_directive(date: dt.date, account: str, amount: Decimal, entry_id: str) -> str:
    """The ``id`` makes it addressable; the source line shifts whenever anything above it
    changes."""
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
