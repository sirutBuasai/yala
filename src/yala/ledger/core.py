"""Core ledger access: load the beancount file once and expose shared, domain-agnostic primitives.

:class:`Ledger` is the single object the rest of the backend uses to interact with the beancount data.
Domain-specific questions live in their own modules and hang off the ledger as uniform query namespaces.

Aggregation is plain Python over the loaded directives — deliberate at this scale (single
currency, a few thousand txns, precomputed once by the builder). Domains that need beancount's
inventory / cost-basis / price semantics (investments, net worth) may use beanquery internally
behind the same interface.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from beancount import loader
from beancount.core import data

from yala import config
from yala.ledger.entities import Posting, Transaction

if TYPE_CHECKING:
    from yala.ledger.income import Income
    from yala.ledger.spending import Spending


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

    def load(self) -> "Ledger":
        if not self.path.exists():
            raise FileNotFoundError(f"Ledger not found: {self.path}")

        entries, errors, _ = loader.load_file(str(self.path))
        self._entries = entries
        self.errors = errors
        self._loaded = True

        if self.strict and errors:
            shown = "; ".join(str(getattr(e, "message", e)) for e in errors[:5])
            more = "" if len(errors) <= 5 else f" (+{len(errors) - 5} more)"
            raise LedgerError(
                f"{len(errors)} error(s) loading {self.path}: {shown}{more}"
            )

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

    def transactions(
        self, year: int | None = None, month: int | None = None
    ) -> list[Transaction]:
        """All transaction views, optionally filtered by year/month. Domain-agnostic."""

        self._require()
        out: list[Transaction] = []

        for e in self._entries:
            if not isinstance(e, data.Transaction):
                continue
            if year is not None and e.date.year != year:
                continue
            if month is not None and e.date.month != month:
                continue

            postings = [
                Posting(p.account, p.units.number)
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
        return out

    def declared_accounts(self, prefix: str | None = None) -> list[str]:
        """Ledger account names, optionally filtered by prefix (e.g. ``'Expenses:'``)."""

        self._require()

        return sorted(
            e.account
            for e in self._entries
            if isinstance(e, data.Open)
            and (prefix is None or e.account.startswith(prefix))
        )

    # --- domain query namespaces (uniform shape: Domain(ledger)) ---

    @property
    def spending(self) -> "Spending":
        from yala.ledger.spending import Spending

        return Spending(self)

    @property
    def income(self) -> "Income":
        from yala.ledger.income import Income

        return Income(self)
