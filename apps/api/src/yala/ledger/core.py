"""Core ledger access: load the beancount file once and expose shared, domain-agnostic primitives.

:class:`Ledger` is the single object the backend uses to reach beancount data; domain-specific
queries live in their own modules and hang off it as uniform namespaces. Aggregation is plain
Python over the loaded directives, though domains needing cost-basis/price semantics
(investments, net worth) may use beanquery behind the same interface.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING

from beancount import loader
from beancount.core import data, prices

from yala import config
from yala.ledger.constants import INTERNAL_META
from yala.ledger.entities import Posting, Transaction
from yala.money import round_cents

if TYPE_CHECKING:
    from yala.ledger.income import Income
    from yala.ledger.networth import NetWorth
    from yala.ledger.spending import Spending
    from yala.ledger.transfers import Transfers


class LedgerError(Exception):
    """Raised when the beancount ledger fails to load cleanly."""


class Ledger:
    """In-memory beancount ledger: load once, then query via domain namespaces."""

    def __init__(self, path: Path | None = None, *, strict: bool = True):
        self.path = Path(path) if path else config.MAIN_LEDGER
        self.strict = strict
        self._entries: list = []
        self.errors: list = []
        self._loaded = False
        self._txn_cache: list[Transaction] | None = None
        self._meta_cache: dict[str, dict] | None = None
        self._price_cache = None

    def load(self) -> "Ledger":
        if not self.path.exists():
            raise FileNotFoundError(f"Ledger not found: {self.path}")

        entries, errors, _ = loader.load_file(str(self.path))
        self._entries = entries
        self.errors = errors
        self._loaded = True
        self._txn_cache = None  # entries changed; drop the derived views
        self._meta_cache = None
        self._price_cache = None

        if self.strict and errors:
            shown = "; ".join(str(getattr(e, "message", e)) for e in errors[:5])
            more = "" if len(errors) <= 5 else f" (+{len(errors) - 5} more)"
            raise LedgerError(f"{len(errors)} error(s) loading {self.path}: {shown}{more}")

        return self

    def _require(self) -> None:
        if not self._loaded:
            self.load()

    @property
    def entries(self) -> list:
        self._require()
        return self._entries

    @property
    def currency(self) -> str:
        """Operating currency, inferred from the ledger's ``commodity``."""
        self._require()

        for e in self._entries:
            if isinstance(e, data.Commodity):
                return e.currency

        return "USD"

    def _all_transactions(self) -> list[Transaction]:
        """Convert every directive to a :class:`Transaction` once and cache it.

        The conversion (and sort) is the expensive part; domain queries call
        :meth:`transactions` dozens of times per build, so building it once and filtering the
        cached list keeps that from being O(entries × queries)."""
        if self._txn_cache is not None:
            return self._txn_cache

        self._require()
        out: list[Transaction] = []

        for e in self._entries:
            if not isinstance(e, data.Transaction):
                continue

            postings = [
                Posting(p.account, p.units.number, dict(p.meta or {}))
                for p in e.postings
                if p.units is not None and p.units.number is not None
            ]

            out.append(
                Transaction(
                    date=e.date,
                    payee=e.payee or e.narration or "",
                    postings=postings,
                    meta=dict(e.meta or {}),
                    flag=e.flag or "*",
                )
            )

        out.sort(key=lambda t: t.date)
        self._txn_cache = out
        return out

    def transactions(self, year: int | None = None, month: int | None = None) -> list[Transaction]:
        """All transaction views, optionally filtered by year/month. Domain-agnostic."""
        txns = self._all_transactions()

        if year is None and month is None:
            return txns

        return [
            t
            for t in txns
            if (year is None or t.date.year == year) and (month is None or t.date.month == month)
        ]

    def balance(self, account: str, as_of: dt.date | None = None) -> Decimal:
        """Summed USD amount for ``account`` up to ``as_of`` (today if None)."""
        total = Decimal(0)
        for t in self.transactions():
            if as_of is not None and t.date > as_of:
                continue
            for p in t.postings:
                if p.account == account:
                    total += p.amount
        return round_cents(total)

    def holdings(self, account: str, as_of: dt.date | None = None) -> dict[str, Decimal]:
        """Per-commodity balance of ``account`` up to ``as_of``, dropping commodities that net to
        zero. Unlike :meth:`balance` it keeps each commodity distinct."""
        self._require()
        inv: dict[str, Decimal] = {}
        for e in self._entries:
            if not isinstance(e, data.Transaction):
                continue
            if as_of is not None and e.date > as_of:
                continue
            for p in e.postings:
                if p.account == account and p.units is not None and p.units.number is not None:
                    inv[p.units.currency] = inv.get(p.units.currency, Decimal(0)) + p.units.number
        return {c: q for c, q in inv.items() if q != 0}

    def _price_map(self):
        if self._price_cache is None:
            self._price_cache = prices.build_price_map(self._entries)
        return self._price_cache

    def value(self, account: str, as_of: dt.date | None = None) -> Decimal:
        """USD value of ``account``'s holdings at ``as_of`` (latest price on/before). Raises
        :class:`LedgerError` if a held ticker has no price."""
        usd = self.currency
        total = Decimal(0)
        for cur, qty in self.holdings(account, as_of).items():
            if cur == usd:
                total += qty
                continue
            priced = prices.get_price(self._price_map(), (cur, usd), as_of)
            if priced is None or priced[1] is None:
                raise LedgerError(f"no price for {cur} on or before {as_of}")
            total += qty * priced[1]
        return round_cents(total)

    def declared_accounts(self, prefix: str | None = None) -> list[str]:
        """Ledger account names, optionally filtered by prefix (e.g. ``'Expenses:'``)."""

        self._require()

        return sorted(
            e.account
            for e in self._entries
            if isinstance(e, data.Open) and (prefix is None or e.account.startswith(prefix))
        )

    def active_accounts(self, prefix: str | None = None) -> list[str]:
        """Accounts opened without a later close as of today, optionally filtered by prefix."""
        self._require()
        today = dt.date.today()
        opened: set[str] = set()
        closed: set[str] = set()

        for e in self._entries:
            if isinstance(e, data.Open) and e.date <= today:
                opened.add(e.account)
            elif isinstance(e, data.Close) and e.date <= today:
                closed.add(e.account)

        active = opened - closed
        return sorted(a for a in active if prefix is None or a.startswith(prefix))

    def is_open(self, account: str) -> bool:
        """Whether ``account`` is opened without a later close as of today."""
        return account in self.active_accounts()

    def account_meta(self) -> dict[str, dict]:
        """Per-account metadata from ``Open`` directives (source-location keys stripped)."""
        self._require()

        if self._meta_cache is None:
            self._meta_cache = {
                e.account: {k: v for k, v in (e.meta or {}).items() if k not in INTERNAL_META}
                for e in self._entries
                if isinstance(e, data.Open)
            }

        return self._meta_cache

    # --- domain query namespaces (uniform shape: Domain(ledger)) ---

    @property
    def spending(self) -> "Spending":
        from yala.ledger.spending import Spending

        return Spending(self)

    @property
    def income(self) -> "Income":
        from yala.ledger.income import Income

        return Income(self)

    @property
    def transfers(self) -> "Transfers":
        from yala.ledger.transfers import Transfers

        return Transfers(self)

    @property
    def net_worth(self) -> "NetWorth":
        from yala.ledger.networth import NetWorth

        return NetWorth(self)
