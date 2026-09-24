"""Credit-card reconciliation: the figure a card's bank app shows, and whether a snapshot may pad.

After its baseline (see :func:`baseline`) a card's spending and bill pay explain its balance in
full, so a later snapshot that disagrees means an entry is missing, not that money moved untracked.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING

from beancount.core import data
from beancount.ops.balance import BalanceError

from yala.ledger.constants import CREDIT_CARDS, INCLUDES_PENDING_META
from yala.ledger.locators import source_of
from yala.ledger.paths import leaf
from yala.ledger.rewrite import reamount
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


def is_card(account: str) -> bool:
    return account.startswith(CREDIT_CARDS)


def baseline(ledger: "Ledger", account: str) -> dt.date | None:
    """The snapshot ``account`` is reconciled from: the one its latest pad settles, else its first.
    None before it has any, when its first snapshot may pad to set its starting balance."""
    snapshots = [
        e.date for e in ledger.entries if isinstance(e, data.Balance) and e.account == account
    ]
    padded = [e.date for e in ledger.entries if isinstance(e, data.Pad) and e.account == account]
    if padded:
        snapshots = [d for d in snapshots if d > max(padded)]

    return min(snapshots, default=None)


def must_agree(ledger: "Ledger", account: str, date: dt.date) -> bool:
    """Whether a card snapshot dated ``date`` must match its entries exactly instead of padding."""
    since = baseline(ledger, account)
    return since is not None and date > since


def includes_pending(meta: Mapping[str, object] | None) -> bool:
    # Beancount parses an unquoted TRUE as a bool; a quoted one arrives as text.
    value = (meta or {}).get(INCLUDES_PENDING_META)
    return value is True or str(value).upper() == "TRUE"


def pending_meta(includes: bool) -> str | None:
    """The stored value for ``includes``; None removes the key, leaving the default."""
    return "TRUE" if includes else None


def unshown_pending(ledger: "Ledger", account: str, as_of: dt.date) -> Decimal:
    """What the bank app's figure leaves out at the end of ``as_of``, in the ledger's sign: the
    card's bank-pending charges, unless its bank counts them.

    Only a charge waits to post: a pending payment or credit already lowers the app's balance.
    """
    if includes_pending(ledger.account_meta().get(account)):
        return Decimal(0)

    total = Decimal(0)
    for t in ledger.transactions():
        if t.date > as_of or not t.bank_pending:
            continue
        charged = sum((p.amount for p in t.postings if p.account == account), Decimal(0))
        total += min(charged, Decimal(0))

    return round_cents(total)


def app_balance(ledger: "Ledger", account: str, as_of: dt.date) -> Decimal:
    """The card's balance at the end of ``as_of`` as its bank app shows it, in the ledger's sign."""
    return ledger.balance(account, as_of) - unshown_pending(ledger, account, as_of)


def refuse_gap(account: str, asserted: Decimal, standing: Decimal, date: dt.date) -> None:
    """Raise when a reconciled card's snapshot disagrees with its entries. Both figures are in the
    ledger's sign, so an asserted figure below the standing one means more is owed."""
    gap = asserted - standing
    if gap == 0:
        return

    missing = "spending" if gap < 0 else "bill pay"
    raise ValueError(
        f"{leaf(account)} is off by {abs(gap)} on {date.isoformat()}. "
        f"Log the missing {missing} first."
    )


def resynced(ledger: "Ledger") -> dict[Path, str]:
    """Each file holding a card assertion the entries no longer add up to, with that assertion set
    to what they add up to now.

    An assertion records what the app showed that day. Editing an earlier entry (a pending charge
    posting at another amount, a refund folded into its charge) leaves that reading true and only
    its recorded figure stale; the next reading is what checks the entries against the bank.
    """
    lines_of: dict[Path, list[str]] = {}
    for e in ledger.errors:
        entry = getattr(e, "entry", None)
        if not isinstance(e, BalanceError) or not is_card(entry.account):
            continue

        path, lineno = source_of(entry)
        lines = lines_of.setdefault(path, path.read_text().splitlines(keepends=True))
        as_of = entry.date - dt.timedelta(days=1)
        lines[lineno - 1] = reamount(lines[lineno - 1], ledger.balance(entry.account, as_of))

    return {path: "".join(lines) for path, lines in lines_of.items()}
