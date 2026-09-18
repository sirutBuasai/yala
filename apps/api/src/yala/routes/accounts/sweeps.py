"""Pointing a sweep at an account: which accounts may be a passthrough, and where one may land.

A passthrough holds no money of its own, so what may be one and what may receive one is the kind's
own business (:data:`yala.ledger.accounts.KINDS`).
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from yala.ledger import Ledger
from yala.ledger.accounts import kind_of
from yala.ledger.constants import SWEEP_META
from yala.ledger.sweep import resolve_terminal, sweep_edges
from yala.routes.accounts.shared import open_destination, resolve
from yala.routes.common import ledger, ok, sink
from yala.routes.errors import api_errors, invalid

router = APIRouter()


class SweepIn(BaseModel):
    account: str
    dest: str | None = None  # empty clears the passthrough


def _valid_sweep_source(account: str) -> str:
    """Only a cash account sweeps. A card is a liability whose balance is what is owed rather than
    money sitting in the wrong place, and an investment's balance is the point of holding it."""
    _, kind = resolve(account)
    if not kind.sweeps:
        raise invalid(f"only a cash account can be a passthrough: {account!r}")
    return account


def _valid_sweep_dest(led: Ledger, dest: str, account: str) -> str:
    """A sweep lands where money is meant to sit: another cash account, or an investment."""
    kind = kind_of(dest)
    if kind is None or not kind.sweep_target:
        raise invalid(f"a sweep destination must be a cash or investment account: {dest!r}")
    return open_destination(led, dest, account)


@router.post("/api/account/sweep")
def post_account_sweep(body: SweepIn) -> dict:
    """Set or clear ``account``'s ``sweep_to`` destination; rejects a cycle."""
    account = _valid_sweep_source(body.account)

    if not body.dest:
        with api_errors():
            sink().set_account_meta(account, SWEEP_META, None)
        return ok(f"cleared sweep for {account}", account=account)

    led = ledger()
    dest = _valid_sweep_dest(led, body.dest, account)

    # Reject a configuration that would cycle before writing it.
    edges = sweep_edges(led)
    edges[account] = dest
    try:
        resolve_terminal(edges, account)
    except ValueError as e:
        raise invalid(str(e))

    with api_errors():
        sink().set_account_meta(account, SWEEP_META, dest)

    return ok(f"{account} now sweeps to {dest}", account=account, dest=dest)
