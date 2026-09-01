"""Auto-maintained passthrough sweeps.

A *passthrough* account holds no money of its own — every dollar flowing through it is really
pulled from or pushed to a destination account. Venmo → Wealthfront is the canonical instance.
Rather than hand-entering a monthly transfer, the backend keeps each passthrough balanced to zero
by maintaining one sweep transfer per month between it and its destination:

* net outflow (the passthrough paid out more than it took in) → ``dest → passthrough`` for the net,
* net inflow (it took in more) → ``passthrough → dest``,
* net zero → no sweep at all.

A passthrough declares its destination as ``sweep_to: "<account>"`` meta on its ``open`` directive,
so the routing lives in the ledger, not this code. Any number of passthroughs may be configured.

**Transitive reduction:** sweeps chain. If Venmo sweeps to Wealthfront and Wealthfront sweeps to
BofA, Venmo's sweep resolves directly to ``Venmo → BofA`` (the *terminal* — the first account in
the chain with no ``sweep_to``), bypassing the intermediate passthrough. Each passthrough is still
reconciled independently against its own native activity, so intermediates never receive another
passthrough's sweep and every passthrough nets to zero.

Reconciled after every write that could touch a month's activity: the sweep appears on the first
qualifying transaction, accumulates as more are added, and vanishes if activity nets back to zero.
The sweeps' own legs are excluded from the net, so reconciling is idempotent.
"""

from __future__ import annotations

import calendar
import datetime as dt
from decimal import Decimal
from typing import TYPE_CHECKING

from beancount.core import data

from yala.ledger import Ledger, LedgerError
from yala.ledger.constants import SWEEP_META
from yala.ledger.entities import leaf
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.transfers import Transfer
    from yala.sink import FileLedgerSink

Month = tuple[int, int]  # (year, month)


# --- sweep configuration (source → destination, from the ledger's open-meta) ---


def sweep_payee(source: str) -> str:
    """The payee stamped on a passthrough's sweep, e.g. ``Assets:Cash:Venmo`` → ``venmo sweep``."""
    return f"{leaf(source).lower()} sweep"


def _edges(ledger: Ledger) -> dict[str, str]:
    """Each passthrough's immediate destination, read from its ``sweep_to`` open-meta."""
    return {a: m[SWEEP_META] for a, m in ledger.account_meta().items() if m.get(SWEEP_META)}


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
    edges = _edges(ledger)
    return {source: resolve_terminal(edges, source) for source in edges}


def is_sweep(accounts: list[str], ledger: Ledger) -> bool:
    """Whether a transfer's accounts occupy an auto-managed sweep slot — i.e. they exactly match
    some passthrough ↔ terminal pair, whatever the payee or direction."""
    pairs = {frozenset((s, t)) for s, t in sweep_targets(ledger).items()}
    return len(accounts) == 2 and frozenset(accounts) in pairs


# --- reconciliation ---


def _last_day(year: int, month: int) -> dt.date:
    return dt.date(year, month, calendar.monthrange(year, month)[1])


def _active_at(ledger: Ledger, on: dt.date) -> set[str]:
    """Accounts opened without a later close as of ``on`` — so we never post a sweep to an account
    that isn't open that month."""
    opened: set[str] = set()
    closed: set[str] = set()
    for e in ledger.entries:
        if isinstance(e, data.Open) and e.date <= on:
            opened.add(e.account)
        elif isinstance(e, data.Close) and e.date <= on:
            closed.add(e.account)
    return opened - closed


def _sweeps_in(
    ledger: Ledger, source: str, terminal: str, year: int, month: int
) -> list["Transfer"]:
    pair = {source, terminal}
    return [
        t
        for t in ledger.transfers.transactions(year, month)
        if {t.from_account, t.to_account} == pair
    ]


def _net_activity(
    ledger: Ledger, source: str, year: int, month: int, sweeps: list["Transfer"]
) -> Decimal:
    """Net of every posting to ``source`` for the month, minus the sweeps' own source legs.
    Negative = it paid out more than it took in (push money in); positive = it took in more."""
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
    """Whether the existing sweep already equals the desired one, so an idempotent reconcile skips
    a redundant write instead of churning the file."""
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
    """Reconcile a single passthrough's sweep for the month (see :func:`reconcile_month`)."""
    # A passthrough (or its terminal) that isn't open this month can't hold a sweep — skip it
    # rather than post to a closed account. Closing a passthrough drains it and clears its
    # ``sweep_to`` first, so a live passthrough's terminal is always open and this skip never
    # silently strands activity.
    if source not in active or terminal not in active:
        return

    sweeps = _sweeps_in(ledger, source, terminal, year, month)

    for extra in sweeps[1:]:  # keep one canonical sweep; drop any duplicates
        sink.delete_entry(extra.locator)
    existing = sweeps[0] if sweeps else None

    net = _net_activity(ledger, source, year, month, sweeps)

    if net == 0:
        if existing is not None:
            sink.delete_entry(existing.locator)
        return

    # The sweep's source leg cancels the net: a net outflow pulls money in from the terminal, a
    # net inflow drains it back.
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
    """Bring each passthrough's single sweep for ``year``/``month`` in line with that month's net
    activity: create it, update it in place, or delete it so the passthrough nets to zero.

    Passthroughs are reconciled independently: one that fails doesn't abort the rest (each sink
    write already strict-reloads and rolls itself back), and because reconciliation is idempotent a
    later write heals whatever failed. Any failures are still surfaced as one aggregated error."""
    ledger = Ledger(sink.main_ledger, strict=True).load()
    date = _last_day(year, month)
    active = _active_at(ledger, date)

    failures: list[str] = []
    for source, terminal in sweep_targets(ledger).items():
        try:
            _reconcile_one(sink, ledger, active, source, terminal, year, month, date)
        except Exception as e:  # isolate: a bad passthrough can't strand the others
            failures.append(f"{source}: {e}")

    if failures:
        raise LedgerError(
            f"sweep reconcile failed for {len(failures)} account(s): " + "; ".join(failures)
        )


def reconcile_months(sink: "FileLedgerSink", months: set[Month]) -> None:
    """Reconcile every passthrough's sweep for each affected month (months are independent)."""
    for year, month in months:
        reconcile_month(sink, year, month)


def retire_passthrough(sink: "FileLedgerSink", account: str, on: dt.date) -> None:
    """Prepare a passthrough for closing on ``on``: delete its auto-sweep for the close month (dated
    month-end, so it would otherwise fall *after* the close date and break the ledger) and drop its
    ``sweep_to`` meta. Afterwards the account's balance reflects only real activity, ready to be
    drained and closed, and reconciliation no longer manages it. No-op if it isn't a passthrough."""
    ledger = Ledger(sink.main_ledger, strict=True).load()
    if not ledger.account_meta().get(account, {}).get(SWEEP_META):
        return

    payee = sweep_payee(account)
    for t in ledger.transfers.transactions(on.year, on.month):
        if t.payee == payee and account in (t.from_account, t.to_account):
            sink.delete_entry(t.locator)

    sink.set_account_meta(account, SWEEP_META, None)
