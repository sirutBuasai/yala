"""A passthrough's ``sweep_to`` keeps it at zero via a monthly transfer to the chain's terminal.
Reconciling is idempotent, since a sweep's own legs are excluded from its net."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import TYPE_CHECKING

from yala.dates import Month, last_day
from yala.ledger import Ledger, LedgerError
from yala.ledger.accounts import sweep_destination
from yala.ledger.constants import SWEEP_META
from yala.ledger.paths import leaf
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.transfers import Transfer
    from yala.sink import FileLedgerSink


def sweep_payee(source: str) -> str:
    return f"{leaf(source).lower()} sweep"


def sweep_edges(ledger: Ledger) -> dict[str, str]:
    """The one reader of ``sweep_to``, for reconciliation, the cycle check and the contract."""
    meta = ledger.account_meta()
    edges = {a: sweep_destination(m) for a, m in meta.items()}
    return {a: dest for a, dest in edges.items() if dest is not None}


def resolve_terminal(edges: dict[str, str], source: str) -> str:
    """Follow ``sweep_to`` edges from ``source`` to the terminal (first account with no
    ``sweep_to``), collapsing intermediate passthroughs. Raises on a cycle."""
    seen = {source}
    node = edges[source]
    while node in edges:
        if node in seen:
            raise ValueError(f"sweep_to cycle through {node}")
        seen.add(node)
        node = edges[node]
    return node


def sweep_targets(ledger: Ledger) -> dict[str, str]:
    """Every configured passthrough source mapped to its resolved terminal destination."""
    edges = sweep_edges(ledger)
    return {source: resolve_terminal(edges, source) for source in edges}


def sweep_pairs(ledger: Ledger) -> set[frozenset[str]]:
    """Every passthrough↔terminal account pair a sweep moves between."""
    return {frozenset((s, t)) for s, t in sweep_targets(ledger).items()}


def is_sweep(accounts: list[str], ledger: Ledger) -> bool:
    """Whether the accounts match a passthrough↔terminal sweep slot."""
    return len(accounts) == 2 and frozenset(accounts) in sweep_pairs(ledger)


def _sweeps_in(
    ledger: Ledger, source: str, terminal: str, year: int, month: int
) -> list["Transfer"]:
    """Matched on payee too: on the account pair alone, a hand-entered transfer was deleted as a
    sweep."""
    pair = {source, terminal}
    payee = sweep_payee(source)
    return [
        t
        for t in ledger.transfers.transactions(year, month)
        if {t.from_account, t.to_account} == pair and t.payee == payee
    ]


def _net_activity(
    ledger: Ledger, source: str, year: int, month: int, sweeps: list["Transfer"]
) -> Decimal:
    """Month's net for ``source``, excluding its own sweep legs. Negative = paid out more."""
    total = Decimal(0)
    for t in ledger.transactions(year, month):
        for p in t.postings:
            if p.account == source:
                total += p.amount
    for s in sweeps:
        total -= s.amount if s.to_account == source else -s.amount
    return round_cents(total)


def _matches(
    sweep: "Transfer",
    from_account: str,
    to_account: str,
    amount: Decimal,
    date: dt.date,
    payee: str,
) -> bool:
    """True if the existing sweep already matches, so reconcile can skip a rewrite."""
    return (
        not sweep.pending
        and sweep.payee == payee
        and sweep.date == date
        and sweep.from_account == from_account
        and sweep.to_account == to_account
        and round_cents(sweep.amount) == amount
    )


def _reconcile_one(
    sink: "FileLedgerSink",
    ledger: Ledger,
    active: set[str],
    source: str,
    terminal: str,
    year: int,
    month: int,
    date: dt.date,
) -> None:
    # A closed source or terminal is skipped; retiring a passthrough clears its sweep_to first.
    if source not in active or terminal not in active:
        return

    sweeps = _sweeps_in(ledger, source, terminal, year, month)

    for extra in sweeps[1:]:  # drop duplicates, keep one
        sink.delete_entry(extra.locator)
    existing = sweeps[0] if sweeps else None

    net = _net_activity(ledger, source, year, month, sweeps)

    if net == 0:
        if existing is not None:
            sink.delete_entry(existing.locator)
        return

    # Net outflow pulls money in from the terminal; net inflow drains it back.
    from_account, to_account = (terminal, source) if net < 0 else (source, terminal)
    amount = abs(net)
    payee = sweep_payee(source)

    if existing is not None and _matches(existing, from_account, to_account, amount, date, payee):
        return

    if existing is not None:
        sink.update_transfer(
            existing.locator,
            from_account=from_account,
            to_account=to_account,
            amount=amount,
            date=date,
            payee=payee,
        )
    else:
        sink.append_transfer(
            date=date,
            from_account=from_account,
            to_account=to_account,
            amount=amount,
            payee=payee,
        )


def reconcile_month(sink: "FileLedgerSink", year: int, month: int) -> None:
    """Reconcile every passthrough's sweep for the month. Passthroughs are independent, so one
    failure is isolated and surfaced as an aggregated error rather than aborting the rest."""
    ledger = Ledger(sink.main_ledger, strict=True).load()
    date = last_day(year, month)
    active = set(ledger.active_accounts(as_of=date))

    failures: list[str] = []
    for source, terminal in sweep_targets(ledger).items():
        try:
            _reconcile_one(sink, ledger, active, source, terminal, year, month, date)
        except Exception as e:
            failures.append(f"{source}: {e}")

    if failures:
        raise LedgerError(
            f"sweep reconcile failed for {len(failures)} account(s): " + "; ".join(failures)
        )


def reconcile_months(sink: "FileLedgerSink", months: set[Month]) -> None:
    for year, month in months:
        reconcile_month(sink, year, month)


def retire_passthrough(sink: "FileLedgerSink", account: str, on: dt.date) -> None:
    """Prepare a passthrough for closing: delete its close-month sweep (dated month-end, so it
    would otherwise fall after the close) and drop its ``sweep_to``. No-op if not a passthrough."""
    ledger = Ledger(sink.main_ledger, strict=True).load()
    if sweep_destination(ledger.account_meta().get(account)) is None:
        return

    payee = sweep_payee(account)
    for t in ledger.transfers.transactions(on.year, on.month):
        if t.payee == payee and account in (t.from_account, t.to_account):
            sink.delete_entry(t.locator)

    sink.set_account_meta(account, SWEEP_META, None)
