"""What the entry routes share: an entry's date before it changes, and the auto-managed guard."""

from __future__ import annotations

import datetime as dt

from beancount.core import data
from fastapi import HTTPException

from yala.ledger.locators import find_entry
from yala.ledger.sweep import is_sweep
from yala.routes.common import ledger


def entry_date(locator: str) -> dt.date | None:
    """Date of an existing entry (looked up before an update/delete), or ``None`` if it's gone."""
    try:
        return find_entry(ledger().entries, locator).date
    except KeyError:
        return None


def reject_if_sweep(entry: data.Transaction) -> None:
    """A passthrough sweep is auto-managed — recomputed from the month's activity — so a manual
    edit or delete is refused rather than silently overwritten or re-created."""
    if is_sweep([p.account for p in entry.postings], ledger()):
        raise HTTPException(
            status_code=409,
            detail="this sweep is auto-managed and can't be edited or deleted",
        )
