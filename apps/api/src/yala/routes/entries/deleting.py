"""One endpoint for every kind: a locator doesn't say its entry's shape, and removal is the same."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from yala.ledger.locators import find_entry
from yala.routes.common import ledger, ok, reconcile_sweeps, sink
from yala.routes.entries.shared import reject_if_sweep
from yala.routes.errors import api_errors

router = APIRouter()


class EntryDeleteIn(BaseModel):
    locator: str


@router.post("/api/entry/delete")
def post_entry_delete(body: EntryDeleteIn) -> dict:
    """Delete a located entry (spending transaction, paycheck, or transfer) from the ledger."""
    with api_errors():
        entry = find_entry(ledger().entries, body.locator)
        reject_if_sweep(entry)
        sink().delete_entry(body.locator)
        reconcile_sweeps(entry.date)

    return ok(f"deleted entry {body.locator}")
