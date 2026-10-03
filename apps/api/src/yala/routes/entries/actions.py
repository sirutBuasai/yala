"""One endpoint per action for every kind: a locator doesn't say its entry's shape, and deleting or
posting one is the same whatever it is."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter
from pydantic import BaseModel

from yala.ledger.locators import find_entry
from yala.routes.common import ledger, ok, reconcile_sweeps, sink
from yala.routes.entries.shared import reject_if_sweep
from yala.routes.errors import api_errors

router = APIRouter()


class EntryIn(BaseModel):
    locator: str


def _act(locator: str, write: Callable[[str], None]) -> None:
    """Sweeps are re-derived for the entry's month, since a sweep follows what that month posted."""
    with api_errors():
        led = ledger()
        entry = find_entry(led.entries, locator)
        reject_if_sweep(entry, led)
        write(locator)
        reconcile_sweeps(entry.date)


@router.post("/api/entry/delete")
def post_entry_delete(body: EntryIn) -> dict:
    _act(body.locator, sink().delete_entry)
    return ok(f"deleted entry {body.locator}")


@router.post("/api/entry/post")
def post_entry_post(body: EntryIn) -> dict:
    _act(body.locator, sink().post_entry)
    return ok(f"posted entry {body.locator}")
