"""FastAPI local edit API backend.

Runs on localhost only — financial data never leaves the machine.
"""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Iterator
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from typing import Literal

from beancount.core import data
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from yala import config
from yala.builder import build_dict
from yala.ledger import Ledger
from yala.ledger.entities import DEDUCTIONS, EXPENSES, INCOME, INVESTMENTS, leaf
from yala.sink import FileLedgerSink, entry_locator, find_transaction

app = FastAPI(title="Yala")

_NAME_RE = re.compile(r"^[A-Za-z0-9:-]+$")
_LEAF_RE = re.compile(r"^[A-Za-z0-9-]+$")


def _ledger() -> Ledger:
    return Ledger(config.MAIN_LEDGER).load()


def _sink() -> FileLedgerSink:
    return FileLedgerSink(config.LEDGER_DIR)


@contextmanager
def _api_errors() -> Iterator[None]:
    """Map exceptions from a write endpoint body to HTTP errors (``KeyError`` → 404 for an
    unknown locator, anything else → 400). Every write endpoint wraps its body here so the
    mapping lives in one place."""
    try:
        yield

    except HTTPException:
        raise

    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _dec(value: float) -> Decimal:
    """Decimal from a request float, via str so 19.99 doesn't become 19.9900000001."""
    return Decimal(str(value))


def _dec_map(m: dict[str, float]) -> dict[str, Decimal]:
    return {k: _dec(v) for k, v in m.items()}


def _valid_name(value: str) -> str:
    if not _NAME_RE.match(value):
        raise HTTPException(status_code=400, detail=f"invalid account/category name: {value!r}")
    return value


def _parse_date(value: str | None) -> dt.date:
    if not value:
        return dt.date.today()

    try:
        return dt.date.fromisoformat(value)

    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid date: {value!r}")


def _active_accounts(ledger: Ledger) -> list[str]:
    """Accounts opened via ``Open`` without a later ``Close``, as of today."""
    today = dt.date.today()
    opened: set[str] = set()
    closed: set[str] = set()

    for e in ledger.entries:
        if isinstance(e, data.Open) and e.date <= today:
            opened.add(e.account)

        elif isinstance(e, data.Close) and e.date <= today:
            closed.add(e.account)

    return sorted(opened - closed)


# --- request bodies ---


class CreditIn(BaseModel):
    account: str
    amount: float


class TransactionIn(BaseModel):
    date: str | None = None
    payee: str
    amount: float
    category: str
    funding_account: str
    pending: bool = False
    credits: list[CreditIn] = []


class TransactionUpdateIn(TransactionIn):
    """An add body plus the locator of the entry to replace."""

    locator: str


class TransactionDeleteIn(BaseModel):
    locator: str


class AccountIn(BaseModel):
    kind: Literal["contribution", "deduction", "category", "funding_credit", "funding_cash"]
    leaf: str


_ACCOUNT_PREFIX: dict[str, str] = {
    "contribution": INVESTMENTS,
    "deduction": DEDUCTIONS,
    "category": EXPENSES,
    "funding_credit": "Liabilities:CC:",
    "funding_cash": "Assets:Cash:",
}


class PaycheckIn(BaseModel):
    date: str | None = None
    gross: float
    deductions: dict[str, float] = {}
    contributions: dict[str, float] = {}
    deposit_account: str
    payee: str = "paycheck"


class PaycheckUpdateIn(PaycheckIn):
    """An add body plus the locator of the paycheck to replace."""

    locator: str


# --- read endpoints ---


@app.get("/api/data")
def get_data() -> dict:
    return build_dict()


@app.get("/api/accounts")
def get_accounts() -> dict:
    ledger = _ledger()
    active = _active_accounts(ledger)
    cash = [a for a in active if a.startswith("Assets:Cash:")]

    return {
        "spending_categories": ledger.spending.categories(),
        "funding_accounts": [
            a for a in active if a.startswith("Liabilities:CC:") or a.startswith("Assets:Cash:")
        ],
        "income_accounts": [a for a in active if a.startswith("Income:")],
        "deduction_categories": sorted(leaf(a) for a in active if a.startswith(DEDUCTIONS)),
        "contribution_categories": sorted(leaf(a) for a in active if a.startswith(INVESTMENTS)),
        "cash_accounts": cash,
        # Where reimbursement credits can land: a Venmo transfer,
        # a bank credit, or a credit-card refund/credit.
        "credit_accounts": [
            a
            for a in active
            if a == "Assets:Venmo"
            or a.startswith("Assets:Cash:")
            or a.startswith("Liabilities:CC:")
        ],
    }


def _postings(entry: data.Transaction) -> list[tuple[str, Decimal]]:
    """The entry's ``(account, number)`` legs, skipping any without a resolved USD amount."""
    return [
        (p.account, p.units.number)
        for p in entry.postings
        if p.units is not None and p.units.number is not None
    ]


def _txn_state(entry: data.Transaction) -> dict:
    """Editable state of one spending transaction (total bill, net share, funding, credits)."""
    postings = _postings(entry)
    expenses = [
        (a, n) for a, n in postings if a.startswith(EXPENSES) and not a.startswith(DEDUCTIONS)
    ]

    if len(expenses) != 1:
        raise HTTPException(status_code=400, detail="not a single-category spending transaction")

    non_expense = [(a, n) for a, n in postings if not a.startswith(EXPENSES)]
    # The funding leg is the outflow (most-negative amount); credits are money-in
    # (positive). Restrict to postings on the declared funding account when the meta is present
    # (so funding and a credit sharing an account still resolve correctly), else all legs.
    funding_meta = (entry.meta or {}).get("funding")
    matches = [i for i, (a, _) in enumerate(non_expense) if a == funding_meta]
    candidates = matches if matches else list(range(len(non_expense)))
    funding_idx = min(candidates, key=lambda i: non_expense[i][1])
    funding_account = non_expense[funding_idx][0]

    credits = [
        {"account": a, "amount": float(n)}
        for i, (a, n) in enumerate(non_expense)
        if i != funding_idx
    ]
    net_expense = expenses[0][1]
    total = net_expense + sum((Decimal(str(s["amount"])) for s in credits), Decimal(0))
    bill = (entry.meta or {}).get("bill")

    return {
        "locator": entry_locator(entry),
        "date": entry.date.isoformat(),
        "payee": entry.payee or entry.narration or "",
        "pending": entry.flag == "!",
        "category": expenses[0][0].split(":", 1)[1],
        # ``amount`` is the total bill (net share + Σ credits); ``net_expense`` is what counts
        # toward the category aggregate. ``bill`` mirrors the total when the entry had credits.
        "amount": float(total),
        "net_expense": float(net_expense),
        "funding_account": funding_account,
        "bill": float(getattr(bill, "number", bill)) if bill is not None else None,
        "credits": credits,
    }


@app.get("/api/transaction")
def get_transaction(locator: str) -> dict:
    with _api_errors():
        return _txn_state(find_transaction(_ledger().entries, locator))


def _paycheck_state(entry: data.Transaction) -> dict:
    """Editable state of one paycheck: gross, deposit, and the deduction/contribution maps."""
    postings = _postings(entry)
    if not any(a.startswith(INCOME) for a, _ in postings):
        raise HTTPException(status_code=400, detail="not a paycheck")

    gross = -sum((n for a, n in postings if a.startswith(INCOME)), Decimal(0))
    deductions: dict[str, float] = {}
    contributions: dict[str, float] = {}
    deposit: tuple[str, Decimal] | None = None

    for a, n in postings:
        if a.startswith(INCOME):
            continue

        elif a.startswith(DEDUCTIONS):
            deductions[leaf(a)] = float(n)

        elif a.startswith(INVESTMENTS):
            contributions[leaf(a)] = float(n)

        elif deposit is None or n > deposit[1]:
            deposit = (a, n)

    return {
        "locator": entry_locator(entry),
        "date": entry.date.isoformat(),
        "payee": entry.payee or entry.narration or "paycheck",
        "gross": float(gross),
        "deposit_account": deposit[0] if deposit else "",
        "deductions": deductions,
        "contributions": contributions,
    }


@app.get("/api/paycheck")
def get_paycheck(locator: str) -> dict:
    with _api_errors():
        return _paycheck_state(find_transaction(_ledger().entries, locator))


@app.get("/api/pending")
def get_pending() -> dict:
    txns = [t for t in _ledger().spending.transactions() if t.pending]

    return {
        "pending": [
            {
                "locator": t.locator,
                "date": t.date.isoformat(),
                "payee": t.payee,
                "amount": float(t.amount),
                "category": t.category,
                "funding_account": t.source,
            }
            for t in txns
        ]
    }


# --- write endpoints ---


def _credits(credits: list[CreditIn]) -> list[tuple[str, Decimal]]:
    credits_out = []

    for s in credits:
        _valid_name(s.account)
        credits_out.append((s.account, _dec(s.amount)))

    return credits_out


def _paycheck_legs(body: PaycheckIn) -> tuple[dict[str, Decimal], dict[str, Decimal]]:
    """Validate a paycheck's deposit + line-item names and convert its maps to Decimal."""
    _valid_name(body.deposit_account)
    for name in (*body.deductions, *body.contributions):
        _valid_name(name)

    return _dec_map(body.deductions), _dec_map(body.contributions)


@app.post("/api/transaction")
def post_transaction(body: TransactionIn) -> dict:
    with _api_errors():
        _valid_name(body.category)
        _valid_name(body.funding_account)

        entry_id = _sink().append_transaction(
            date=_parse_date(body.date),
            payee=body.payee,
            amount=_dec(body.amount),
            category=body.category,
            funding_account=body.funding_account,
            pending=body.pending,
            credits=_credits(body.credits),
        )

    return {
        "ok": True,
        "message": f"appended transaction for {body.payee}",
        "id": entry_id,
    }


@app.post("/api/transaction/update")
def post_transaction_update(body: TransactionUpdateIn) -> dict:
    with _api_errors():
        _valid_name(body.category)
        _valid_name(body.funding_account)

        entry_id = _sink().update_transaction(
            body.locator,
            date=dt.date.fromisoformat(body.date) if body.date else None,
            payee=body.payee,
            amount=_dec(body.amount),
            category=body.category,
            funding_account=body.funding_account,
            pending=body.pending,
            credits=_credits(body.credits),
        )

    return {
        "ok": True,
        "message": f"updated transaction for {body.payee}",
        "id": entry_id,
    }


@app.post("/api/transaction/delete")
def post_transaction_delete(body: TransactionDeleteIn) -> dict:
    """Delete a located entry (spending transaction or paycheck) from the ledger."""
    with _api_errors():
        _sink().delete_transaction(body.locator)

    return {"ok": True, "message": f"deleted entry {body.locator}"}


@app.post("/api/account")
def post_account(body: AccountIn) -> dict:
    if not _LEAF_RE.match(body.leaf):
        raise HTTPException(status_code=400, detail=f"invalid account leaf: {body.leaf!r}")

    account = f"{_ACCOUNT_PREFIX[body.kind]}{body.leaf}"

    with _api_errors():
        _sink().open_account(account)

    return {"ok": True, "account": account, "message": f"opened {account}"}


@app.post("/api/paycheck")
def post_paycheck(body: PaycheckIn) -> dict:
    with _api_errors():
        deductions, contributions = _paycheck_legs(body)

        _sink().append_paycheck(
            date=_parse_date(body.date),
            gross=_dec(body.gross),
            deductions=deductions,
            contributions=contributions,
            deposit_account=body.deposit_account,
            payee=body.payee,
        )

    return {"ok": True, "message": f"appended paycheck dated {body.date or 'today'}"}


@app.post("/api/paycheck/update")
def post_paycheck_update(body: PaycheckUpdateIn) -> dict:
    with _api_errors():
        deductions, contributions = _paycheck_legs(body)

        entry_id = _sink().update_paycheck(
            body.locator,
            date=dt.date.fromisoformat(body.date) if body.date else None,
            gross=_dec(body.gross),
            deductions=deductions,
            contributions=contributions,
            deposit_account=body.deposit_account,
            payee=body.payee,
        )

    return {"ok": True, "message": "updated paycheck", "id": entry_id}


# Static frontend (the SvelteKit static-adapter build output) is mounted LAST so /api/*
# routes always win. Absence is tolerated (e.g. before `npm run build` in apps/web/).
_WEB_DIR = Path(__file__).resolve().parents[4] / "apps" / "web" / "build"
if _WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_WEB_DIR, html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
