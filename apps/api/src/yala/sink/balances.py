"""Writing net-worth snapshots: a padded assertion, a verify-only one, an edit, a liquidation.

A cash or investment account has an ``Equity:Adjustments:*`` plug, so its snapshot is a ``pad`` +
``balance`` pair and the untracked delta lands there. A liability has no plug, so its snapshot
carries its own correction entry for whatever spending or bill pay has not been entered yet.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

from beancount.core import data, prices
from beancount.core.amount import Amount
from beancount.parser import printer

from yala.ledger import Ledger, directives, pads
from yala.ledger.accounts import plug_account
from yala.ledger.constants import BALANCE, DEFAULT_CURRENCY, OPENING_BALANCES, PAD
from yala.ledger.locators import find_balance, source_of
from yala.ledger.paths import leaf
from yala.ledger.rewrite import reamount
from yala.money import round_cents
from yala.sink.accounts import AccountWrites


class BalanceWrites(AccountWrites):
    """Snapshot writes, mixed into :class:`~yala.sink.FileLedgerSink`.

    Over ``AccountWrites`` because retiring an account closes it, and over the file machinery
    through it: the bases state which writes this one is built on rather than relying on the
    composition in :class:`~yala.sink.FileLedgerSink` to supply them.
    """

    def _liquidate_postings(
        self, ledger: Ledger, account: str, date: dt.date
    ) -> tuple[list[data.Posting], Decimal]:
        """Postings that drain every holding of ``account`` to USD at ``date`` prices, plus the
        total USD weight drained. Non-USD legs carry an ``@ price``; the USD leg is a plain amount.
        Raises if a held ticker has no price on or before ``date``."""
        holdings = ledger.holdings(account, date)
        price_map = prices.build_price_map(ledger.entries)
        usd = ledger.currency

        postings: list[data.Posting] = []
        weight_out = Decimal(0)
        for cur, qty in holdings.items():
            if cur == usd:
                amt = round_cents(qty)
                postings.append(data.Posting(account, Amount(-amt, usd), None, None, None, None))
                weight_out += amt
            else:
                priced = prices.get_price(price_map, (cur, usd), date)
                if priced is None or priced[1] is None:
                    raise ValueError(f"no price for {cur} on or before {date.isoformat()}")
                price = priced[1]
                postings.append(
                    data.Posting(account, Amount(-qty, cur), None, Amount(price, usd), None, None)
                )
                weight_out += qty * price

        return postings, weight_out

    def liquidate_into(
        self, account: str, date: dt.date, legs: list[tuple[str, Decimal]], plug: str | None
    ) -> None:
        """Convert every holding to USD at ``date`` prices, split the total across ``legs``, then
        close the account. ``plug``, when given, absorbs the sub-cent rounding gap so the entry
        balances exactly, and is closed too."""
        ledger = Ledger(self.main_ledger, strict=True).load()
        usd = ledger.currency

        postings, weight_out = self._liquidate_postings(ledger, account, date)

        for dest, amount in legs:
            postings.append(directives.posting(dest, round_cents(amount)))

        residual = weight_out - round_cents(sum((a for _, a in legs), Decimal(0)))
        if residual != 0 and plug is not None:
            postings.append(data.Posting(plug, Amount(residual, usd), None, None, None, None))

        if postings:
            entry = data.Transaction(
                {"id": str(uuid.uuid4())},
                date,
                "*",
                f"close {leaf(account)}",
                None,
                frozenset(),
                frozenset(),
                postings,
            )
            self._insert_entry("transfers", entry)

        self.close_account(account, date)
        if plug is not None:
            self.close_account(plug, date)

    def log_balance(
        self, account: str, amount: Decimal, date: dt.date, counter_account: str
    ) -> str:
        """Snapshot ``account`` to ``amount`` USD as of ``date``, preceded by a ``pad`` into
        ``counter_account`` when one is needed.

        The ``balance`` is always written, so logging the same figure month after month builds the
        history even when nothing moved. The ``pad`` is dated the day before (assertions are checked
        at start of day) and only written when the projected balance differs: beancount rejects a
        pad it does not need, so emitting one unconditionally would make an unchanged balance
        impossible to log. Share lots are reclassified to USD first, net-worth-neutrally, so the
        single USD assertion is authoritative."""
        # Through the shared sign rule, so both snapshot paths refuse a negative asset in one place.
        amount = directives.stored_amount(account, round_cents(amount))
        pad_date = date - dt.timedelta(days=1)
        self._assert_accounts_active(date, [account, counter_account])

        ledger = Ledger(self.main_ledger, strict=True).load()
        usd = ledger.currency
        drain, _ = self._liquidate_postings(ledger, account, pad_date)
        share_legs = [p for p in drain if p.price is not None]  # non-USD legs carry an @ price

        # What the account will hold once any share lots are reclassified.
        projected = ledger.holdings(account, pad_date).get(usd, Decimal(0))

        blocks: list[str] = []

        if share_legs:
            shares_value = sum((-p.units.number * p.price.number for p in share_legs), Decimal(0))
            usd_add = round_cents(shares_value)
            postings = [*share_legs, directives.posting(account, usd_add)]
            residual = shares_value - usd_add
            if residual != 0:
                postings.append(
                    data.Posting(counter_account, Amount(residual, usd), None, None, None, None)
                )
            conversion = data.Transaction(
                {"id": str(uuid.uuid4())},
                pad_date,
                "*",
                None,
                f"value {leaf(account)} to USD",
                frozenset(),
                frozenset(),
                postings,
            )
            blocks.append(printer.format_entry(conversion).rstrip("\n"))
            projected += usd_add

        if projected != amount:
            blocks.append(f"{pad_date.isoformat()} {PAD} {account} {counter_account}")
        entry_id = str(uuid.uuid4())
        blocks.append(directives.balance_directive(date, account, amount, entry_id))

        # The pad is dated the day before the assertion, so the pair is placed as one block by the
        # assertion's date — splitting them would file the pad in the month before it belongs to.
        self._insert(directives.balance_subdir(account), date, "\n\n".join(blocks))
        return entry_id

    def _correction(self, account: str, gap: Decimal, date: dt.date) -> data.Transaction:
        """The entry that makes a verify-only snapshot hold: the gap, against opening balances.

        Named for what a gap on a liability always means — spending or a bill payment that has not
        been entered — so the ledger says so rather than leaving an unexplained figure.
        """
        return data.Transaction(
            {"id": str(uuid.uuid4())},
            date,
            "*",
            None,
            f"unlogged activity on {leaf(account)}",
            frozenset(),
            frozenset(),
            [
                directives.posting(account, gap),
                directives.posting(OPENING_BALANCES, -gap),
            ],
        )

    def verify_balance(self, account: str, amount: Decimal, date: dt.date) -> str:
        """Snapshot an account that has no adjustment plug: ``balance`` only, never a ``pad``.

        A liability cannot be padded, so a figure that disagrees with what the entries add up to is
        carried by a dated correction against ``Equity:Opening-Balances`` instead. The statement is
        the authority on what is owed, so the snapshot is written either way; the correction is what
        makes the gap visible and addressable later.

        ``amount`` reads as a statement does — owed positive, a credit negative — and is stored
        inverted."""
        amount = directives.stored_amount(account, round_cents(amount))
        # A start-of-day assertion is checked against the close of the day before — the same
        # instant log_balance pads at.
        as_of = date - dt.timedelta(days=1)

        ledger = Ledger(self.main_ledger, strict=True).load()
        standing = ledger.holdings(account, as_of).get(ledger.currency, Decimal(0))
        gap = amount - standing

        needed = [account] if gap == 0 else [account, OPENING_BALANCES]
        self._assert_accounts_active(date, needed)

        blocks: list[str] = []
        if gap != 0:
            blocks.append(printer.format_entry(self._correction(account, gap, as_of)).rstrip("\n"))

        entry_id = str(uuid.uuid4())
        blocks.append(directives.balance_directive(date, account, amount, entry_id))

        self._insert(directives.balance_subdir(account), date, "\n\n".join(blocks))
        return entry_id

    def update_balance(self, locator: str, amount: Decimal) -> tuple[str, dt.date, str]:
        """Rewrite the amount on the existing ``balance`` assertion at ``locator``, reconciling its
        ``pad`` so the edited figure still loads. Returns ``(account, date, locator)``.

        Editing an assertion can flip whether a pad is required in either direction, and beancount
        rejects both an unexplained delta and an unused pad. An assertion with no ``id`` is stamped
        with one, so the returned locator is the stable handle from then on."""
        entry = find_balance(Ledger(self.main_ledger, strict=True).load().entries, locator)
        account, date = entry.account, entry.date
        amount = directives.stored_amount(account, round_cents(amount))

        if entry.amount.currency != DEFAULT_CURRENCY:
            raise ValueError(
                f"{locator} asserts {entry.amount.currency}, not {DEFAULT_CURRENCY}; edit the "
                "share lots in the ledger instead"
            )

        path, lineno = source_of(entry)
        original = path.read_text()
        lines = original.splitlines(keepends=True)
        i = lineno - 1

        header = f"{date.isoformat()} {BALANCE} {account}"
        if not (0 <= i < len(lines) and lines[i].startswith(header)):
            raise ValueError(
                f"stale locator {locator!r}: line {i + 1} of {path.name} is not the "
                f"{date.isoformat()} balance for {account}"
            )

        lines[i] = reamount(lines[i], amount)

        entry_id = (entry.meta or {}).get("id")
        if not entry_id:
            entry_id = str(uuid.uuid4())
            lines[i + 1 : i + 1] = [f'  id: "{entry_id}"\n']

        if plug_account(account) is None:
            # Nothing to absorb a difference, so the edited figure simply has to hold; the commit
            # rolls back if it doesn't.
            self._commit(path, "".join(lines))
        else:
            pads.settle(self.main_ledger, account, {path: lines}, {path: original})
        return account, date, f"id:{entry_id}"
