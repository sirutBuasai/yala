"""The write abstraction for edit-mode writes back to the ledger.

Writes never scatter file I/O across the API. They go through a :class:`LedgerSink`.

Every write re-loads the ledger strictly; if the result is broken the touched file is rolled back
to its prior state and the error re-raised, so a bad write never leaves a corrupt ledger on disk.
"""

from __future__ import annotations

import datetime as dt
import os
import re
import tempfile
import uuid
from abc import ABC, abstractmethod
from decimal import Decimal
from pathlib import Path

from beancount.core import data, prices
from beancount.core.amount import Amount
from beancount.ops.balance import BalanceError
from beancount.ops.pad import PadError
from beancount.parser import printer

from yala import config
from yala.ledger import Ledger
from yala.ledger.constants import (
    BALANCE,
    CLOSE,
    DEFAULT_CURRENCY,
    DROPPED_META,
    EXPENSES,
    LIABILITIES,
    OPEN,
    PAD,
)
from yala.ledger.entities import leaf
from yala.ledger.locators import find_balance, find_entry
from yala.ledger.networth import adjustment_account
from yala.money import round_cents

Credit = tuple[str, Decimal]
DeductionLeg = tuple[str, Decimal]  # (account, amount)
ContributionLeg = tuple[str, str | None, Decimal]  # (account, label or None, amount)


def _stored_amount(account: str, amount: Decimal) -> Decimal:
    """The signed figure a ``balance`` assertion carries for ``account``.

    Liability balances are entered the way a bank app shows them — the amount *owed*, positive —
    but beancount keeps them negative, so one rule flips them for every write path."""
    return -abs(amount) if account.startswith(LIABILITIES) else amount


def _build_posting(account: str, number: Decimal, meta: dict | None = None) -> data.Posting:
    """Construct a single USD posting with no cost/price/flag; optional posting meta (e.g.
    ``label``)."""
    return data.Posting(
        account, Amount(number, "USD"), cost=None, price=None, flag=None, meta=meta or None
    )


def _atomic_write(path: Path, content: str) -> None:
    """Write ``content`` to ``path`` atomically: temp file in the same dir, fsync, then rename."""
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".yala-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())

        os.replace(tmp, path)

    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


# A `balance` line: "<date> balance <account>" then the right-aligned number and its currency.
# None of the three leading tokens can contain a space, so they split cleanly.
_BALANCE_LINE_RE = re.compile(r"^(?P<head>\S+ \S+ \S+)(?P<gap> +)(?P<num>[\d,.-]+)(?P<tail> .*)$")


def _reamount(line: str, amount: Decimal) -> str:
    """Swap the amount on a ``balance`` line, holding the number's right edge so the assets files
    keep their aligned column."""
    m = _BALANCE_LINE_RE.match(line.rstrip("\n"))
    if m is None:
        raise ValueError(f"unparsable balance line: {line!r}")

    num = f"{amount:,.2f}"
    end = len(m["head"]) + len(m["gap"]) + len(m["num"])
    gap = max(end - len(m["head"]) - len(num), 1)
    return f"{m['head']}{' ' * gap}{num}{m['tail']}\n"


def _balance_directive(date: dt.date, account: str, amount: Decimal, entry_id: str) -> str:
    """A ``balance`` assertion plus the ``id`` meta that makes it addressable by locator.

    Assertions are bare directives rather than transactions, so they carry no id unless written
    with one — and without it the only handle is the source line, which shifts whenever anything
    above it in the file changes."""
    return (
        f"{date.isoformat()} {BALANCE} {account}    {amount:,.2f} {DEFAULT_CURRENCY}\n"
        f'  id: "{entry_id}"'
    )


# Rounds allowed to settle pads after a balance edit: one for the edited assertion, one for the
# next assertion that re-pins the account, plus slack for a drop that reveals another.
_MAX_PAD_ROUNDS = 6


def _pad_insert_index(lines: list[str], pad_date: dt.date, balance_index: int) -> int:
    """Where to slot a new ``pad``: joining that date's existing pad group when the file has one
    (an assets month lists its pads together, then its balances), else above the assertion it
    serves."""
    tag = f"{pad_date} {PAD} "
    group = [n for n, line in enumerate(lines) if line.startswith(tag)]
    if not group:
        return balance_index

    at = group[-1] + 1  # past the group's last pad, and the blank line spacing it
    while at < len(lines) and not lines[at].strip():
        at += 1
    return at


def _year_header(subdir: str, year: int) -> str:
    """The ``; <Title> for <year>`` header line a new year-file opens with."""
    # Comment title each dated ``<subdir>/<year>.beancount`` file opens with.
    _file_titles = {
        "spending": "Spending transactions",
        "income": "Income",
        "transfers": "Transfers",
        "assets": "Asset balances",
        "liabilities": "Liability balances",
    }

    return f"; {_file_titles[subdir]} for {year}"


class LedgerSink(ABC):
    """Interface for writing reviewed entries back to the ledger."""

    @abstractmethod
    def append_transaction(
        self,
        date: dt.date,
        payee: str,
        amount: Decimal,
        category: str,
        funding_account: str,
        pending: bool = False,
        credits: list[Credit] | None = None,
    ) -> str:
        """Append one spending directive (one Expenses category, credits, one funding account)."""

    @abstractmethod
    def update_transaction(self, locator: str, **new_state) -> str:
        """Replace an existing spending directive in place, preserving/assigning its id."""

    @abstractmethod
    def append_paycheck(
        self,
        date: dt.date,
        gross: Decimal,
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
        deposit_account: str,
        payee: str = "paycheck",
    ) -> str:
        """Append one paycheck directive (Income − gross, deductions, contributions, deposit)."""

    @abstractmethod
    def update_paycheck(self, locator: str, **new_state) -> str:
        """Replace an existing paycheck directive in place, preserving/assigning its id."""

    @abstractmethod
    def append_transfer(
        self,
        date: dt.date,
        from_account: str,
        to_account: str,
        amount: Decimal,
        payee: str = "payment",
        pending: bool = False,
    ) -> str:
        """Append one transfer directive (from_account − amount, to_account + amount)."""

    @abstractmethod
    def update_transfer(self, locator: str, **new_state) -> str:
        """Replace an existing transfer directive in place, preserving/assigning its id."""

    @abstractmethod
    def delete_entry(self, locator: str) -> None:
        """Remove any located directive (spending, paycheck, or transfer) from its source file."""


class FileLedgerSink(LedgerSink):
    """File writes to the dated ``spending/`` and ``income/`` beancount files."""

    def __init__(self, ledger_dir: Path | None = None):
        self.ledger_dir = Path(ledger_dir) if ledger_dir else config.LEDGER_DIR
        self.main_ledger = self.ledger_dir / "main.beancount"

    # --- pre-write validation ---

    def _assert_accounts_active(self, date: dt.date, accounts: list[str]) -> None:
        """Verify every account is active on ``date`` before writing, for a clean error message."""
        opened: dict[str, dt.date] = {}
        closed: dict[str, dt.date] = {}

        for e in Ledger(self.main_ledger).load().entries:
            if isinstance(e, data.Open):
                opened[e.account] = min(e.date, opened.get(e.account, e.date))

            elif isinstance(e, data.Close):
                closed[e.account] = min(e.date, closed.get(e.account, e.date))

        for account in dict.fromkeys(accounts):  # de-dupe, preserve order
            open_date = opened.get(account)

            if open_date is None:
                raise ValueError(f"Unable to insert transaction: {account} does not exist.")

            if open_date > date:
                raise ValueError(
                    f"Unable to insert transaction: {account} is not open as of date "
                    f"{date.isoformat()} (opened {open_date.isoformat()})."
                )

            close_date = closed.get(account)
            if close_date is not None and close_date <= date:
                raise ValueError(
                    f"Unable to insert transaction: {account} is closed as of date "
                    f"{date.isoformat()} (closed {close_date.isoformat()})."
                )

    # --- spending ---

    def _spending_entry(
        self,
        *,
        date: dt.date,
        flag: str,
        payee: str,
        category: str,
        amount: Decimal,
        funding_account: str,
        entry_id: str,
        credits: list[Credit] | None = None,
        narration: str | None = None,
        tags=(),
        links=(),
        extra_meta: dict | None = None,
    ) -> data.Transaction:
        """Build a balanced beancount ``Transaction`` for a spending directive."""
        meta: dict = {"id": entry_id, "funding": funding_account}

        total = round_cents(amount)
        credit_postings = []
        credit_sum = Decimal(0)

        for account, amt in credits or []:
            qamt = round_cents(amt)
            credit_postings.append(_build_posting(account, qamt))
            credit_sum += qamt

        net_expense = total - credit_sum

        if credit_postings:
            meta["bill"] = Amount(total, "USD")

        if extra_meta:
            meta.update(extra_meta)

        postings = [_build_posting(f"{EXPENSES}{category}", net_expense), *credit_postings]
        postings.append(_build_posting(funding_account, -total))

        return data.Transaction(
            meta, date, flag, payee, narration, frozenset(tags), frozenset(links), postings
        )

    def append_transaction(
        self,
        date: dt.date,
        payee: str,
        amount: Decimal,
        category: str,
        funding_account: str,
        pending: bool = False,
        credits: list[Credit] | None = None,
    ) -> str:
        credit_legs = [(a, Decimal(amt)) for a, amt in (credits or [])]

        self._assert_accounts_active(
            date, [f"{EXPENSES}{category}", funding_account, *(a for a, _ in credit_legs)]
        )

        entry_id = str(uuid.uuid4())
        entry = self._spending_entry(
            date=date,
            flag="!" if pending else "*",
            payee=payee,
            category=category,
            amount=Decimal(amount),
            funding_account=funding_account,
            entry_id=entry_id,
            credits=credit_legs,
        )
        self._append_entry("spending", entry)

        return entry_id

    def update_transaction(
        self,
        locator: str,
        *,
        payee: str,
        amount: Decimal,
        category: str,
        funding_account: str,
        date: dt.date | None = None,
        pending: bool = False,
        credits: list[Credit] | None = None,
    ) -> str:
        """Replace the located transaction in place; assign an id if it lacked one."""
        entry, entry_id, carried, resolved_date = self._locate_for_update(locator, date)
        credit_legs = [(a, Decimal(amt)) for a, amt in (credits or [])]

        narration = entry.narration if entry.narration and entry.narration != payee else None

        self._assert_accounts_active(
            resolved_date, [f"{EXPENSES}{category}", funding_account, *(a for a, _ in credit_legs)]
        )
        new_entry = self._spending_entry(
            date=resolved_date,
            flag="!" if pending else "*",
            payee=payee,
            category=category,
            amount=Decimal(amount),
            funding_account=funding_account,
            entry_id=entry_id,
            credits=credit_legs,
            narration=narration,
            tags=entry.tags or (),
            links=entry.links or (),
            extra_meta=carried,
        )
        self._replace_located(
            entry, resolved_date, printer.format_entry(new_entry), "spending", locator
        )
        return entry_id

    # --- paycheck ---

    def _paycheck_entry(
        self,
        *,
        date: dt.date,
        gross: Decimal,
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
        deposit_account: str,
        entry_id: str,
        payee: str = "paycheck",
        narration: str | None = None,
        tags=(),
        links=(),
        extra_meta: dict | None = None,
    ) -> data.Transaction:
        """Build a balanced beancount paycheck ``Transaction`` (validates accounts + legs).

        Legs are pre-resolved to full accounts; a contribution's label (Roth401k/…) is stamped as
        a ``label`` posting-meta on its leg so the money stays in one account (net worth sees one
        401k pot) while income can still break out the split.
        """
        gross = round_cents(gross)
        deduction_legs = [(a, round_cents(v)) for a, v in deduction_legs]
        contribution_legs = [(a, s, round_cents(v)) for a, s, v in contribution_legs]

        self._assert_accounts_active(
            date,
            [
                income_account,
                deposit_account,
                *(a for a, _ in deduction_legs),
                *(a for a, _, _ in contribution_legs),
            ],
        )

        out = sum((v for _, v in deduction_legs), Decimal(0)) + sum(
            (v for _, _, v in contribution_legs), Decimal(0)
        )
        take_home = gross - out
        if take_home < 0:
            raise ValueError(
                f"deductions and contributions exceed gross (take-home would be {take_home})"
            )

        postings = [_build_posting(income_account, -gross)]
        for account, amt in deduction_legs:
            postings.append(_build_posting(account, amt))
        for account, label, amt in contribution_legs:
            postings.append(_build_posting(account, amt, {"label": label} if label else None))
        postings.append(_build_posting(deposit_account, take_home))

        meta: dict = {"id": entry_id}
        if extra_meta:
            meta.update(extra_meta)

        return data.Transaction(
            meta, date, "*", payee, narration, frozenset(tags), frozenset(links), postings
        )

    def append_paycheck(
        self,
        date: dt.date,
        gross: Decimal,
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
        deposit_account: str,
        payee: str = "paycheck",
    ) -> str:
        entry_id = str(uuid.uuid4())
        entry = self._paycheck_entry(
            date=date,
            gross=gross,
            income_account=income_account,
            deduction_legs=deduction_legs,
            contribution_legs=contribution_legs,
            deposit_account=deposit_account,
            entry_id=entry_id,
            payee=payee,
        )
        self._append_entry("income", entry)

        return entry_id

    def update_paycheck(
        self,
        locator: str,
        *,
        gross: Decimal,
        income_account: str,
        deduction_legs: list[DeductionLeg],
        contribution_legs: list[ContributionLeg],
        deposit_account: str,
        date: dt.date | None = None,
        payee: str = "paycheck",
    ) -> str:
        """Replace the located paycheck in place (or relocate it if the year changes)."""
        entry, entry_id, carried, resolved_date = self._locate_for_update(locator, date)

        new_entry = self._paycheck_entry(
            date=resolved_date,
            gross=Decimal(gross),
            income_account=income_account,
            deduction_legs=[(a, Decimal(v)) for a, v in deduction_legs],
            contribution_legs=[(a, s, Decimal(v)) for a, s, v in contribution_legs],
            deposit_account=deposit_account,
            entry_id=entry_id,
            payee=payee,
            narration=entry.narration,
            tags=entry.tags or (),
            links=entry.links or (),
            extra_meta=carried,
        )

        self._replace_located(
            entry, resolved_date, printer.format_entry(new_entry), "income", locator
        )

        return entry_id

    # --- transfers ---

    def _transfer_entry(
        self,
        *,
        date: dt.date,
        payee: str,
        from_account: str,
        to_account: str,
        amount: Decimal,
        entry_id: str,
        flag: str = "*",
        narration: str | None = None,
        tags=(),
        links=(),
        extra_meta: dict | None = None,
    ) -> data.Transaction:
        """Build a balanced transfer ``Transaction``: amount out of ``from_account`` into
        ``to_account`` (no Expenses/Income legs, so it's neither spending nor income)."""
        amt = round_cents(amount)
        self._assert_accounts_active(date, [from_account, to_account])

        meta: dict = {"id": entry_id}
        if extra_meta:
            meta.update(extra_meta)

        postings = [_build_posting(to_account, amt), _build_posting(from_account, -amt)]

        return data.Transaction(
            meta, date, flag, payee, narration, frozenset(tags), frozenset(links), postings
        )

    def append_transfer(
        self,
        date: dt.date,
        from_account: str,
        to_account: str,
        amount: Decimal,
        payee: str = "payment",
        pending: bool = False,
    ) -> str:
        entry_id = str(uuid.uuid4())
        entry = self._transfer_entry(
            date=date,
            payee=payee,
            from_account=from_account,
            to_account=to_account,
            amount=Decimal(amount),
            entry_id=entry_id,
            flag="!" if pending else "*",
        )
        self._append_entry("transfers", entry)

        return entry_id

    def update_transfer(
        self,
        locator: str,
        *,
        from_account: str,
        to_account: str,
        amount: Decimal,
        date: dt.date | None = None,
        payee: str = "payment",
        pending: bool = False,
    ) -> str:
        entry, entry_id, carried, resolved_date = self._locate_for_update(locator, date)

        new_entry = self._transfer_entry(
            date=resolved_date,
            payee=payee,
            from_account=from_account,
            to_account=to_account,
            amount=Decimal(amount),
            entry_id=entry_id,
            flag="!" if pending else "*",
            narration=entry.narration,
            tags=entry.tags or (),
            links=entry.links or (),
            extra_meta=carried,
        )
        self._replace_located(
            entry, resolved_date, printer.format_entry(new_entry), "transfers", locator
        )

        return entry_id

    # --- delete + account directives ---

    def delete_entry(self, locator: str) -> None:
        """Remove the located entry (spending, paycheck, or transfer) from its file, then
        strict-reload."""
        entry = find_entry(
            Ledger(self.main_ledger, strict=True).load().entries, locator
        )  # raises KeyError if unknown

        path, original, lines, begin, end = self._entry_span(entry, locator)

        self._commit(path, "".join(lines[:begin] + lines[end:]), original)

    def open_account(
        self,
        account: str,
        date: dt.date | None = None,
        *,
        currency: str | None = DEFAULT_CURRENCY,
        meta: dict[str, str] | None = None,
    ) -> None:
        """Append an ``open`` directive; ``currency=None`` lets the account hold any ticker."""
        date = date or dt.date.today()
        header = f"{date.isoformat()} {OPEN} {account}" + (f" {currency}" if currency else "")
        metalines = "".join(f'\n  {k}: "{v}"' for k, v in (meta or {}).items())
        self._append_account_directive(account, header + metalines)

    def assert_balance(
        self,
        account: str,
        amount: str,
        currency: str = DEFAULT_CURRENCY,
        date: dt.date | None = None,
    ) -> None:
        """Append a ``balance`` assertion, e.g. a starting 0.00 balance for a new account."""
        date = date or dt.date.today()
        self._append_account_directive(
            account, f"{date.isoformat()} {BALANCE} {account} {amount} {currency}"
        )

    def close_account(self, account: str, date: dt.date | None = None) -> None:
        """Append a ``close`` directive. A strict reload rejects an unopened or already-closed
        account."""
        date = date or dt.date.today()
        self._append_account_directive(account, f"{date.isoformat()} {CLOSE} {account}")

    def _liquidate_postings(
        self, ledger: Ledger, account: str, date: dt.date
    ) -> tuple[list[data.Posting], Decimal]:
        """Postings that drain every holding of ``account`` to USD at ``date`` prices, plus the
        total USD weight drained. Non-USD legs carry an ``@ price`` (``posting.price`` set); the
        USD leg (if any) is a plain amount. Shared by :meth:`close_investment` (drain to legs) and
        :meth:`log_balance` (reclassify share lots to USD in place)."""
        holdings = ledger.holdings(account, date)
        price_map = prices.build_price_map(ledger.entries)
        usd = ledger.currency

        postings: list[data.Posting] = []
        weight_out = Decimal(0)  # USD value leaving the account
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

    def close_investment(
        self, account: str, date: dt.date, legs: list[tuple[str, Decimal]], plug: str | None
    ) -> None:
        """Convert every holding to USD at ``date`` prices, split the total across ``legs``, then
        close the account. ``plug`` absorbs the sub-cent rounding gap, or is None when there is
        none."""
        ledger = Ledger(self.main_ledger, strict=True).load()
        usd = ledger.currency

        postings, weight_out = self._liquidate_postings(ledger, account, date)

        for dest, amount in legs:
            postings.append(_build_posting(dest, round_cents(amount)))

        # The plug carries the sub-cent gap so the entry balances exactly.
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
            self._append_entry("transfers", entry)

        self.close_account(account, date)
        if plug is not None:
            self.close_account(plug, date)

    def log_balance(
        self, account: str, amount: Decimal, date: dt.date, counter_account: str
    ) -> str:
        """Snapshot ``account`` to ``amount`` USD as of ``date``, appended to
        ``assets/<year>.beancount`` as a ``balance`` assertion, preceded by a ``pad`` when one is
        needed.

        The ``balance`` is the snapshot: it is always written, so logging the same figure month
        after month builds the history even when nothing moved. The ``pad`` (dated the day before,
        so it lands before the start-of-day assertion) is only written when the account's projected
        balance differs from ``amount``, routing that untracked delta into ``counter_account`` (the
        account's ``Equity:Adjustments:*`` plug). beancount rejects a pad it doesn't need
        ("Unused Pad entry"), so emitting one unconditionally would make an unchanged balance
        impossible to log.

        If the account still holds share lots, they are first reclassified to USD at ``date``
        prices in place — a net-worth-neutral conversion — so the single USD assertion is
        authoritative and nothing double-counts."""
        amount = round_cents(amount)
        pad_date = date - dt.timedelta(days=1)
        self._assert_accounts_active(date, [account, counter_account])

        ledger = Ledger(self.main_ledger, strict=True).load()
        usd = ledger.currency
        drain, _ = self._liquidate_postings(ledger, account, pad_date)
        share_legs = [p for p in drain if p.price is not None]  # non-USD legs carry an @ price

        # What the account will hold once any share lots are reclassified: its USD component plus
        # the converted share value. Compared against `amount` to decide whether a pad is needed.
        projected = ledger.holdings(account, pad_date).get(usd, Decimal(0))

        blocks: list[str] = []

        if share_legs:
            shares_value = sum((-p.units.number * p.price.number for p in share_legs), Decimal(0))
            usd_add = round_cents(shares_value)
            postings = [*share_legs, _build_posting(account, usd_add)]
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
        blocks.append(_balance_directive(date, account, amount, entry_id))

        self._append(
            "assets", date.year, _year_header("assets", date.year), "\n\n".join(blocks) + "\n"
        )
        return entry_id

    def verify_balance(self, account: str, amount: Decimal, date: dt.date) -> str:
        """Snapshot an account that has no adjustment plug (a liability): ``balance`` only, never a
        ``pad``.

        Because nothing can absorb a difference, the figure has to agree with what the ledger
        already computes. A card balance that disagrees means spending or a bill payment hasn't
        been entered yet, so the gap is reported and nothing is written — the mismatch is the
        signal, and padding it would hide it. (``_append`` strict-reloads and rolls back too, so a
        stale projection can't slip a bad assertion through; this check just names the fix.)

        ``amount`` is the figure owed, positive; it is stored negative."""
        amount = _stored_amount(account, round_cents(amount))
        self._assert_accounts_active(date, [account])

        ledger = Ledger(self.main_ledger, strict=True).load()
        # A start-of-day assertion is checked against the close of the day before — the same
        # instant log_balance pads at.
        standing = ledger.holdings(account, date - dt.timedelta(days=1)).get(
            ledger.currency, Decimal(0)
        )
        if standing != amount:
            raise ValueError(
                f"{leaf(account)} computes to {standing} on {date.isoformat()}, not {amount}: "
                f"enter the missing {abs(amount - standing)} of spending or bill pay first"
            )

        entry_id = str(uuid.uuid4())
        self._append(
            "liabilities",
            date.year,
            _year_header("liabilities", date.year),
            _balance_directive(date, account, amount, entry_id) + "\n",
        )
        return entry_id

    def update_balance(self, locator: str, amount: Decimal) -> tuple[str, dt.date, str]:
        """Rewrite the amount on the existing ``balance`` assertion at ``locator``, reconciling its
        ``pad`` so the edited figure still loads. Returns ``(account, date, locator)``.

        Editing an assertion changes how much must be absorbed at its date, which can flip whether
        a pad is required: raising a figure that had no pad leaves the delta unexplained (the
        assertion fails), while setting one back to its carried value makes an existing pad unused
        (beancount rejects that). So a pad is ensured up front, then dropped again only if beancount
        reports it unused — which it pinpoints by source line.

        A migrated assertion carries no ``id``, so it is only addressable by source line; editing
        one stamps an id on it and returns the stable locator to use from then on.

        A liability's ``amount`` is the figure owed, positive, as on the way in."""
        entry = find_balance(Ledger(self.main_ledger, strict=True).load().entries, locator)
        account, date = entry.account, entry.date
        amount = _stored_amount(account, round_cents(amount))

        if entry.amount.currency != DEFAULT_CURRENCY:
            raise ValueError(
                f"{locator} asserts {entry.amount.currency}, not {DEFAULT_CURRENCY}; edit the "
                "share lots in the ledger instead"
            )

        path = Path(entry.meta["filename"])
        original = path.read_text()
        lines = original.splitlines(keepends=True)
        i = int(entry.meta["lineno"]) - 1

        header = f"{date.isoformat()} {BALANCE} {account}"
        if not (0 <= i < len(lines) and lines[i].startswith(header)):
            raise ValueError(
                f"stale locator {locator!r}: line {i + 1} of {path.name} is not the "
                f"{date.isoformat()} balance for {account}"
            )

        lines[i] = _reamount(lines[i], amount)

        entry_id = (entry.meta or {}).get("id")
        if not entry_id:
            entry_id = str(uuid.uuid4())
            lines[i + 1 : i + 1] = [f'  id: "{entry_id}"\n']

        if account.startswith(LIABILITIES):
            # Verify-only account: there is no plug to settle, so the edited figure simply has to
            # hold — _commit rolls the file back if it doesn't.
            self._commit(path, "".join(lines), original)
        else:
            self._settle_pads(account, {path: lines}, {path: original})
        return account, date, f"id:{entry_id}"

    def _settle_pads(
        self, account: str, work: dict[Path, list[str]], originals: dict[Path, str]
    ) -> None:
        """Write ``work``, then add or drop ``account``'s pads until the ledger loads clean.

        An assertion is a checkpoint, so editing one shifts the running balance onward until the
        next assertion re-pins it — needing a pad at the edited date *and* usually at that next
        one, which may live in another year's file. Rather than predict them, each round writes the
        candidate files and lets beancount name what is missing (a failed assertion → add its pad)
        or redundant (an unused pad → drop it). Any other error, or exhausting the rounds, restores
        every touched file and re-raises."""
        try:
            for _ in range(_MAX_PAD_ROUNDS):
                for path, lines in work.items():
                    _atomic_write(path, "".join(lines))

                errors = Ledger(self.main_ledger, strict=False).load().errors
                if not errors:
                    return

                if not self._apply_pad_fix(account, errors, work, originals):
                    break

            Ledger(self.main_ledger, strict=True).load()  # unresolved: surface beancount's own text

        except Exception:
            for path, before in originals.items():
                _atomic_write(path, before)
            raise

    def _apply_pad_fix(
        self,
        account: str,
        errors: list,
        work: dict[Path, list[str]],
        originals: dict[Path, str],
    ) -> bool:
        """Add or drop one of ``account``'s pads in response to ``errors``; True if anything moved.

        Only this account's pads are touched — an unrelated complaint is left for the caller to
        surface rather than papered over with a plug."""
        for e in errors:
            source = getattr(e, "source", None) or {}
            entry = getattr(e, "entry", None)
            filename, lineno = source.get("filename"), source.get("lineno")

            if not filename or not lineno or getattr(entry, "account", None) != account:
                continue

            path = Path(filename)
            lines = self._working(path, work, originals)
            n = int(lineno) - 1

            if isinstance(e, PadError):
                if not lines[n].startswith(f"{entry.date} {PAD} {account} "):
                    continue
                del lines[n]
                if n < len(lines) and not lines[n].strip():
                    del lines[n]  # and the blank line that spaced it
                return True

            if isinstance(e, BalanceError):
                pad_date = entry.date - dt.timedelta(days=1)
                at = _pad_insert_index(lines, pad_date, n)
                lines[at:at] = [f"{pad_date} {PAD} {account} {adjustment_account(account)}\n", "\n"]
                return True

        return False

    @staticmethod
    def _working(path: Path, work: dict[Path, list[str]], originals: dict[Path, str]) -> list[str]:
        """The mutable line buffer for ``path``, reading (and remembering) it on first touch."""
        if path not in work:
            originals[path] = path.read_text()
            work[path] = originals[path].splitlines(keepends=True)
        return work[path]

    def set_account_meta(self, account: str, key: str, value: str | None) -> None:
        """Set (or, when ``value`` is None, remove) a string meta key on an account's ``open``
        directive in place, then strict-reload. Raises ``KeyError`` for an unknown account."""
        opens = [
            e
            for e in Ledger(self.main_ledger, strict=True).load().entries
            if isinstance(e, data.Open) and e.account == account
        ]
        if not opens:
            raise KeyError(account)

        open_entry = opens[0]
        path = Path(open_entry.meta["filename"])
        begin = int(open_entry.meta["lineno"]) - 1

        original = path.read_text()
        lines = original.splitlines(keepends=True)

        # The open's meta lines are the indented block right below its header.
        end = begin + 1
        while end < len(lines) and lines[end].startswith((" ", "\t")) and lines[end].strip():
            end += 1

        key_re = re.compile(rf"^\s*{re.escape(key)}\s*:")
        block = [lines[begin]] + [m for m in lines[begin + 1 : end] if not key_re.match(m)]
        if value is not None:
            block.append(f'  {key}: "{value}"\n')

        self._commit(path, "".join(lines[:begin] + block + lines[end:]), original)

    def _account_file(self, account: str) -> Path:
        """The ``.beancount`` file a directive for ``account`` belongs in, so it lands beside its
        siblings regardless of how the ledger splits its account files.

        An existing ``open`` for the same account wins (a close goes in the file that declared it);
        otherwise the file most of the account's same-parent siblings live in; failing that, the
        top-level ``accounts.beancount`` for a wholly new family.
        """
        opens = [e for e in Ledger(self.main_ledger).load().entries if isinstance(e, data.Open)]

        def file_of(entry: data.Open) -> str | None:
            return (entry.meta or {}).get("filename")

        for e in opens:
            if e.account == account and (f := file_of(e)):
                return Path(f)

        parent = account.rsplit(":", 1)[0]
        counts: dict[str, int] = {}
        for e in opens:
            if e.account.rsplit(":", 1)[0] == parent and (f := file_of(e)):
                counts[f] = counts.get(f, 0) + 1

        if counts:
            return Path(max(counts, key=lambda f: counts[f]))

        return self.ledger_dir / "accounts.beancount"

    def _append_account_directive(self, account: str, directive: str) -> None:
        """Append one account directive to the file holding the account's family (see
        ``_account_file``), with strict-reload/rollback."""
        target = self._account_file(account)

        original = target.read_text() if target.exists() else ""
        text = original if not original or original.endswith("\n") else original + "\n"

        self._commit(target, f"{text}{directive}\n", original)

    # --- internals: locate, write, roll back ---

    def _locate_for_update(
        self, locator: str, date: dt.date | None
    ) -> tuple[data.Transaction, str, dict, dt.date]:
        """Shared preamble for both updates: strict-load, resolve the locator, and derive the
        target entry, its id (assigned if missing), the meta to carry forward, and the resolved
        date (the edit's date, or the entry's own if unchanged)."""
        entry = find_entry(Ledger(self.main_ledger, strict=True).load().entries, locator)
        entry_id = (entry.meta or {}).get("id") or str(uuid.uuid4())
        carried = {
            k: v
            for k, v in (entry.meta or {}).items()
            if k not in DROPPED_META and not k.startswith("__")
        }
        return entry, entry_id, carried, (date or entry.date)

    def _entry_span(
        self, entry: data.Transaction, locator: str
    ) -> tuple[Path, str, list[str], int, int]:
        """Locate an entry's source block: ``(path, original_text, lines, begin, end)``.

        Guards against a stale locator — the ``begin`` line must still be the entry's
        ``<date> <flag>`` header, or we'd clobber the wrong entry — then consumes the entry's
        indented meta/posting lines (a blank line ends the block) to find ``end``."""
        path = Path(entry.meta["filename"])
        start = int(entry.meta["lineno"])

        original = path.read_text()
        lines = original.splitlines(keepends=True)
        begin = start - 1

        header = lines[begin] if 0 <= begin < len(lines) else ""
        if not header.startswith(f"{entry.date.isoformat()} {entry.flag}"):
            raise ValueError(
                f"stale locator {locator!r}: line {start} of {path.name} is not the resolved "
                f"{entry.date.isoformat()} {entry.flag} entry"
            )

        end = begin + 1
        while end < len(lines) and lines[end].startswith((" ", "\t")) and lines[end].strip():
            end += 1

        return path, original, lines, begin, end

    def _append_entry(self, subdir: str, entry: data.Transaction) -> None:
        """Format ``entry`` and append it to its dated ``<subdir>/<year>.beancount`` file."""
        year = entry.date.year
        self._append(subdir, year, _year_header(subdir, year), printer.format_entry(entry))

    def _append(self, subdir: str, year: int, header: str, block: str) -> None:
        year_file = self.ledger_dir / subdir / f"{year}.beancount"
        include_line = f'include "{subdir}/{year}.beancount"'
        agg_file = self.ledger_dir / f"{subdir}.beancount"

        year_before = year_file.read_text() if year_file.exists() else None
        main_before = self.main_ledger.read_text() if self.main_ledger.exists() else None
        agg_before = agg_file.read_text() if agg_file.exists() else None

        try:
            year_file.parent.mkdir(parents=True, exist_ok=True)

            if year_before is None:
                _atomic_write(year_file, f"{header}\n")
                self._ensure_include(subdir, include_line)

            text = year_file.read_text()
            if text and not text.endswith("\n"):
                text += "\n"

            _atomic_write(year_file, f"{text}\n{block}")

            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            if year_before is None:
                year_file.unlink(missing_ok=True)

            else:
                _atomic_write(year_file, year_before)

            self._restore(agg_file, agg_before)
            self._restore(self.main_ledger, main_before)

            raise

    def _commit(self, path: Path, content: str, original: str) -> None:
        """Write ``content`` to ``path``, strict-reload, and roll ``path`` back to ``original``
        (re-raising) if the reload fails — so a bad write never sticks."""
        _atomic_write(path, content)
        try:
            Ledger(self.main_ledger, strict=True).load()

        except Exception:
            _atomic_write(path, original)
            raise

    def _replace_located(
        self, entry: data.Transaction, resolved_date: dt.date, block: str, subdir: str, locator: str
    ) -> None:
        """Swap ``entry``'s source block for ``block``, then strict-reload with rollback.

        If ``resolved_date`` falls in a different year than the entry, relocate it to
        ``<subdir>/<year>.beancount`` instead of rewriting in place."""
        path, original, lines, begin, end = self._entry_span(entry, locator)

        # A date edit that crosses into a different year must relocate the entry to that year's
        # file, not leave it stranded in the original year's file.
        if resolved_date.year != entry.date.year:
            _atomic_write(path, "".join(lines[:begin] + lines[end:]))  # drop from the old file

            try:
                self._append(
                    subdir, resolved_date.year, _year_header(subdir, resolved_date.year), block
                )

            except Exception:
                _atomic_write(path, original)  # restore old file; _append rolled back its own
                raise

            return

        rewritten = "".join(lines[:begin] + block.splitlines(keepends=True) + lines[end:])

        self._commit(path, rewritten, original)

    @staticmethod
    def _restore(path: Path, before: str | None) -> None:
        """Undo a touched file: delete it if it didn't exist before, else rewrite prior content."""
        if before is None:
            path.unlink(missing_ok=True)

        elif path.exists() and path.read_text() != before:
            _atomic_write(path, before)

    def _ensure_include(self, subdir: str, include_line: str) -> None:
        """Register a new year file's include in the ``{subdir}.beancount`` aggregator (which main
        includes), so a new year joins the same load path as the existing ones — not scattered
        into main. Wires the aggregator into main too, for a fresh ledger."""
        self._ensure_main_include(f'include "{subdir}.beancount"')

        aggregator = self.ledger_dir / f"{subdir}.beancount"
        text = aggregator.read_text() if aggregator.exists() else ""
        if include_line in text:
            return

        lines = text.splitlines()
        prefix = f'include "{subdir}/'
        last = max((i for i, ln in enumerate(lines) if ln.startswith(prefix)), default=None)

        if last is None:
            lines.append(include_line)

        else:
            lines.insert(last + 1, include_line)

        _atomic_write(aggregator, "\n".join(lines) + "\n")

    def _ensure_main_include(self, include_line: str) -> None:
        """Idempotently ensure ``include_line`` is present in main.beancount (appends if absent)."""
        text = self.main_ledger.read_text() if self.main_ledger.exists() else ""
        if include_line in text:
            return

        lead = "" if not text or text.endswith("\n") else "\n"
        _atomic_write(self.main_ledger, f"{text}{lead}{include_line}\n")
