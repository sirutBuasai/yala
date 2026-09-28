"""A snapshot is a ``pad`` and ``balance`` pair, the unexplained part going to the plug. A card pads
only up to its baseline (see :mod:`yala.ledger.cards`)."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable, Iterable, Mapping
from decimal import Decimal

from beancount.core import data, prices
from beancount.core.amount import Amount
from beancount.parser import printer

from yala.ledger import Ledger, cards, directives, pads
from yala.ledger.accounts import open_entry
from yala.ledger.constants import BALANCE, DEFAULT_CURRENCY, PAD
from yala.ledger.locators import find_balance, source_of
from yala.ledger.paths import leaf
from yala.ledger.rewrite import reamount
from yala.money import round_cents
from yala.sink.accounts import AccountWrites


class BalanceWrites(AccountWrites):
    """Built over ``AccountWrites``, since retiring an account closes it."""

    def _liquidate_postings(
        self, ledger: Ledger, account: str, date: dt.date
    ) -> tuple[list[data.Posting], Decimal]:
        """Drains every holding to USD at ``date`` prices, returning the postings and the total.
        Raises if a ticker has no price by then."""
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
        """``plug``, when given, absorbs the sub-cent rounding gap and is closed too."""
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

    def _ensure_plugs(self, pairs: Iterable[tuple[str, str]]) -> None:
        """A card gets its plug at its first snapshot, dated from the account so a back-dated
        snapshot finds it open. ``pairs`` is ``(account, plug)``."""
        ledger = Ledger(self.main_ledger, strict=True).load()

        for account, plug in pairs:
            if open_entry(ledger, plug) is not None:
                continue

            opened = open_entry(ledger, account)
            if opened is None:
                continue  # no such account: the active-accounts check is what reports that

            self.open_account(plug, opened.date)

    def _snapshot_block(
        self, ledger: Ledger, account: str, amount: Decimal, date: dt.date, counter_account: str
    ) -> tuple[str, str]:
        """``(block, id)`` for one snapshot. The ``balance`` is always written; the ``pad``, dated
        the day before, only when needed, since beancount rejects an unused pad. A card's pending
        charges are added back, and past its baseline it must agree."""
        # Through the shared sign rule: a liability is inverted, and a negative asset refused.
        amount = directives.stored_amount(account, round_cents(amount))
        pad_date = date - dt.timedelta(days=1)
        self._assert_accounts_active(date, [account, counter_account], ledger)

        usd = ledger.currency
        card = cards.is_card(account)
        if card:
            amount += cards.unshown_pending(ledger, account, pad_date)

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
            if card and cards.must_agree(ledger, account, date):
                cards.refuse_gap(account, amount, projected, date)
            blocks.append(f"{pad_date.isoformat()} {PAD} {account} {counter_account}")
        entry_id = str(uuid.uuid4())
        blocks.append(directives.balance_directive(date, account, amount, entry_id))

        # The pad is dated the day before the assertion, so the pair is placed as one block by the
        # assertion's date — splitting them would file the pad in the month before it belongs to.
        return "\n\n".join(blocks), entry_id

    def log_balance(
        self, account: str, amount: Decimal, date: dt.date, counter_account: str
    ) -> str:
        """One snapshot, written and checked on its own (see :meth:`_snapshot_block`)."""
        self._ensure_plugs([(account, counter_account)])
        ledger = Ledger(self.main_ledger, strict=True).load()
        block, entry_id = self._snapshot_block(ledger, account, amount, date, counter_account)

        self._insert(directives.balance_subdir(account), date, block, resync=False)
        return entry_id

    def log_balances(
        self, readings: Mapping[str, Decimal], date: dt.date, plug_of: Callable[[str], str]
    ) -> tuple[dict[str, str], dict[str, str]]:
        """Every reading dated ``date``, against one load and one checked write, so a full sitting
        lands at once. Returns ``(ids, errors)`` by account: a refused reading is reported and the
        rest still land."""
        self._ensure_plugs((account, plug_of(account)) for account in readings)
        ledger = Ledger(self.main_ledger, strict=True).load()

        ids: dict[str, str] = {}
        errors: dict[str, str] = {}
        by_side: dict[str, list[str]] = {}

        for account, amount in readings.items():
            try:
                block, ids[account] = self._snapshot_block(
                    ledger, account, amount, date, plug_of(account)
                )
            except ValueError as e:
                errors[account] = str(e)
                continue
            by_side.setdefault(directives.balance_subdir(account), []).append(block)

        try:
            with self._all_or_nothing(resync=False):
                # Each side is its own file, so the one parse still places both.
                for subdir, blocks in by_side.items():
                    self._insert(
                        subdir, date, "\n\n".join(blocks), check=False, entries=ledger.entries
                    )

        except Exception:
            # The joint reload only says that one failed, so write each on its own to learn which.
            for account in ids.copy():
                try:
                    ids[account] = self.log_balance(
                        account, readings[account], date, plug_of(account)
                    )
                except Exception as e:
                    del ids[account]
                    errors[account] = str(e)

        return ids, errors

    def update_balance(self, locator: str, amount: Decimal) -> tuple[str, dt.date, str]:
        """Returns ``(account, date, locator)``; the pad is reconciled either way and an id stamped
        if missing. Cards follow :meth:`log_balance`'s baseline rule."""
        ledger = Ledger(self.main_ledger, strict=True).load()
        entry = find_balance(ledger.entries, locator)
        account, date = entry.account, entry.date
        amount = directives.stored_amount(account, round_cents(amount))

        pad_through = None
        if cards.is_card(account):
            as_of = date - dt.timedelta(days=1)
            amount += cards.unshown_pending(ledger, account, as_of)
            if cards.must_agree(ledger, account, date):
                cards.refuse_gap(account, amount, ledger.balance(account, as_of), date)
            pad_through = cards.baseline(ledger, account)

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

        pads.settle(self.main_ledger, account, {path: lines}, {path: original}, pad_through)
        return account, date, f"id:{entry_id}"
