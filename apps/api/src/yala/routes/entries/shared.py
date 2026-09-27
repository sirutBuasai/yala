"""What the entry routes share: writing an entry and re-deriving the sweeps of every month it
touched, and the auto-managed guard. Each reuses the request's loaded ledger."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable

from beancount.core import data
from fastapi import HTTPException

from yala.ledger import Ledger
from yala.ledger.locators import find_entry
from yala.ledger.sweep import is_sweep
from yala.routes.common import parse_date, parse_date_opt, reconcile_sweeps


def entry_date(locator: str, led: Ledger) -> dt.date | None:
    """Date of an existing entry (looked up before an update/delete), or ``None`` if it's gone."""
    try:
        return find_entry(led.entries, locator).date
    except KeyError:
        return None


def reject_if_sweep(entry: data.Transaction, led: Ledger) -> None:
    """A passthrough sweep is auto-managed — recomputed from the month's activity — so a manual
    edit or delete is refused rather than silently overwritten or re-created."""
    if is_sweep([p.account for p in entry.postings], led):
        raise HTTPException(
            status_code=409,
            detail="this sweep is auto-managed and can't be edited or deleted",
        )


def appended(date: str | None, write: Callable[[dt.date], str]) -> str:
    """Writes a new entry on ``date`` (today when omitted) and returns its id."""
    on = parse_date(date)
    entry_id = write(on)
    reconcile_sweeps(on)
    return entry_id


def replaced(
    locator: str, date: str | None, led: Ledger, write: Callable[[dt.date | None], str]
) -> str:
    """Rewrites a located entry, given its new date or ``None`` to keep its own, and returns its id.
    Sweeps are re-derived for the month it left as well as the one it landed in."""
    old = entry_date(locator, led)
    new = parse_date_opt(date)
    entry_id = write(new)
    reconcile_sweeps(old, new or old)
    return entry_id
