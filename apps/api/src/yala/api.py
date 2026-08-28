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
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from yala import config, projections
from yala.builder import build_dict
from yala.ledger import Ledger, payroll
from yala.ledger.constants import CASH, CREDIT_CARDS, EXPENSES
from yala.ledger.locators import find_entry
from yala.ledger.venmo_sweep import is_sweep, reconcile_months
from yala.sink import FileLedgerSink

app = FastAPI(title="Yala")

_NAME_RE = re.compile(r"^[A-Za-z0-9:-]+$")
_LEAF_RE = re.compile(r"^[A-Za-z0-9-]+$")
_WEB_DIR = Path(__file__).resolve().parents[4] / "apps" / "web" / "build"

_ACCOUNT_PREFIX: dict[str, str] = {
    "category": EXPENSES,
    "funding_credit": CREDIT_CARDS,
    "funding_cash": CASH,
}

# A transaction/transfer amount must be positive; a credit or payroll line item may be zero
# (e.g. a $0 deduction) but never negative.
Amount = Annotated[float, Field(gt=0, allow_inf_nan=False)]
NonNegAmount = Annotated[float, Field(ge=0, allow_inf_nan=False)]


# --- shared helpers ---


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


def _ok(message: str, **extra) -> dict:
    """A write endpoint's success body: ``{"ok": True, "message": ...}`` plus any extras."""
    return {"ok": True, "message": message, **extra}


def _valid_name(value: str) -> str:
    if not _NAME_RE.match(value):
        raise HTTPException(status_code=400, detail=f"invalid account/category name: {value!r}")
    return value


def _parse_date(value: str | None) -> dt.date:
    """Parse an ISO date, defaulting to today when omitted (used by add endpoints)."""
    if not value:
        return dt.date.today()

    try:
        return dt.date.fromisoformat(value)

    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid date: {value!r}")


def _parse_date_opt(value: str | None) -> dt.date | None:
    """Parse an ISO date, or ``None`` when omitted (used by update endpoints to keep the
    entry's own date). Raises a 400 with a clear message on a malformed string."""
    return _parse_date(value) if value else None


def _reconcile_sweeps(*dates: dt.date | None) -> None:
    """Re-derive the auto-managed Venmo sweep for every month a just-written entry touched, so it
    tracks Venmo activity as entries are added, edited, moved across months, or removed."""
    months = {(d.year, d.month) for d in dates if d is not None}
    if months:
        reconcile_months(_sink(), months)


def _entry_date(locator: str) -> dt.date | None:
    """Date of an existing entry (looked up before an update/delete), or ``None`` if it's gone."""
    try:
        return find_entry(_ledger().entries, locator).date
    except KeyError:
        return None


# --- overview / collection reads ---


@app.get("/api/data")
def get_data() -> dict:
    return build_dict()


@app.get("/api/accounts")
def get_accounts() -> dict:
    ledger = _ledger()
    cash = ledger.active_accounts(CASH)
    funding = sorted(cash + ledger.active_accounts(CREDIT_CARDS))

    return {
        "spending_categories": ledger.spending.categories(),
        "funding_accounts": funding,
        "employers": payroll.employers(ledger),
        "payroll_options": [
            {
                "kind": o.kind,
                "label": o.label,
                "employer": o.employer,
                "account": o.account,
            }
            for o in payroll.options(ledger)
        ],
        "cash_accounts": cash,
        "credit_accounts": funding,
    }


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


# --- transactions ---


class CreditIn(BaseModel):
    account: str
    amount: NonNegAmount


class TransactionIn(BaseModel):
    date: str | None = None
    payee: str
    amount: Amount
    category: str
    funding_account: str
    pending: bool = False
    credits: list[CreditIn] = []


class TransactionUpdateIn(TransactionIn):
    """An add body plus the locator of the entry to replace."""

    locator: str


class TransactionDeleteIn(BaseModel):
    locator: str


def _credits(credits: list[CreditIn]) -> list[tuple[str, Decimal]]:
    credits_out = []

    for s in credits:
        _valid_name(s.account)
        credits_out.append((s.account, _dec(s.amount)))

    return credits_out


@app.get("/api/transaction")
def get_transaction(locator: str) -> dict:
    with _api_errors():
        return projections.txn_state(find_entry(_ledger().entries, locator))


@app.post("/api/transaction")
def post_transaction(body: TransactionIn) -> dict:
    with _api_errors():
        _valid_name(body.category)
        _valid_name(body.funding_account)

        date = _parse_date(body.date)
        entry_id = _sink().append_transaction(
            date=date,
            payee=body.payee,
            amount=_dec(body.amount),
            category=body.category,
            funding_account=body.funding_account,
            pending=body.pending,
            credits=_credits(body.credits),
        )
        _reconcile_sweeps(date)

    return _ok(f"appended transaction for {body.payee}", id=entry_id)


@app.post("/api/transaction/update")
def post_transaction_update(body: TransactionUpdateIn) -> dict:
    with _api_errors():
        _valid_name(body.category)
        _valid_name(body.funding_account)

        old_date = _entry_date(body.locator)
        new_date = _parse_date_opt(body.date)
        entry_id = _sink().update_transaction(
            body.locator,
            date=new_date,
            payee=body.payee,
            amount=_dec(body.amount),
            category=body.category,
            funding_account=body.funding_account,
            pending=body.pending,
            credits=_credits(body.credits),
        )
        _reconcile_sweeps(old_date, new_date or old_date)

    return _ok(f"updated transaction for {body.payee}", id=entry_id)


@app.post("/api/transaction/delete")
def post_transaction_delete(body: TransactionDeleteIn) -> dict:
    """Delete a located entry (spending transaction or paycheck) from the ledger."""
    with _api_errors():
        old_date = _entry_date(body.locator)
        _sink().delete_entry(body.locator)
        _reconcile_sweeps(old_date)

    return _ok(f"deleted entry {body.locator}")


# --- paychecks ---


class PaycheckIn(BaseModel):
    date: str | None = None
    employer: str
    gross: Amount
    deductions: dict[str, NonNegAmount] = {}
    contributions: dict[str, NonNegAmount] = {}
    deposit_account: str
    payee: str = "paycheck"


class PaycheckUpdateIn(PaycheckIn):
    """An add body plus the locator of the paycheck to replace."""

    locator: str


def _resolve_paycheck(
    body: PaycheckIn, ledger: Ledger
) -> tuple[str, list[tuple[str, Decimal]], list[tuple[str, str | None, Decimal]]]:
    """Resolve an employer + option-labeled maps into concrete ledger legs.

    Returns ``(income_account, deduction_legs, contribution_legs)``; raises 400 on an unknown
    employer or a line item the selected employer doesn't offer.
    """
    _valid_name(body.deposit_account)

    if body.employer not in payroll.employers(ledger):
        raise HTTPException(
            status_code=400, detail=f"unknown or inactive employer: {body.employer!r}"
        )

    income_account = f"{payroll.SALARY}{body.employer}"
    deduction_legs: list[tuple[str, Decimal]] = []
    contribution_legs: list[tuple[str, str | None, Decimal]] = []

    for label, amount in body.deductions.items():
        option = payroll.resolve(ledger, "deduction", label, body.employer)
        if option is None:
            raise HTTPException(
                status_code=400, detail=f"no deduction {label!r} for {body.employer}"
            )
        deduction_legs.append((option.account, _dec(amount)))

    for label, amount in body.contributions.items():
        option = payroll.resolve(ledger, "contribution", label, body.employer)
        if option is None:
            raise HTTPException(
                status_code=400, detail=f"no contribution {label!r} for {body.employer}"
            )
        contribution_legs.append((option.account, option.label, _dec(amount)))

    return income_account, deduction_legs, contribution_legs


@app.get("/api/paycheck")
def get_paycheck(locator: str) -> dict:
    with _api_errors():
        ledger = _ledger()
        return projections.paycheck_state(
            find_entry(ledger.entries, locator), ledger.account_meta()
        )


@app.post("/api/paycheck")
def post_paycheck(body: PaycheckIn) -> dict:
    with _api_errors():
        income_account, deduction_legs, contribution_legs = _resolve_paycheck(body, _ledger())

        date = _parse_date(body.date)
        _sink().append_paycheck(
            date=date,
            gross=_dec(body.gross),
            income_account=income_account,
            deduction_legs=deduction_legs,
            contribution_legs=contribution_legs,
            deposit_account=body.deposit_account,
            payee=body.payee,
        )
        _reconcile_sweeps(date)

    return _ok(f"appended paycheck dated {body.date or 'today'}")


@app.post("/api/paycheck/update")
def post_paycheck_update(body: PaycheckUpdateIn) -> dict:
    with _api_errors():
        income_account, deduction_legs, contribution_legs = _resolve_paycheck(body, _ledger())

        old_date = _entry_date(body.locator)
        new_date = _parse_date_opt(body.date)
        entry_id = _sink().update_paycheck(
            body.locator,
            date=new_date,
            gross=_dec(body.gross),
            income_account=income_account,
            deduction_legs=deduction_legs,
            contribution_legs=contribution_legs,
            deposit_account=body.deposit_account,
            payee=body.payee,
        )
        _reconcile_sweeps(old_date, new_date or old_date)

    return _ok("updated paycheck", id=entry_id)


# --- transfers ---


class TransferIn(BaseModel):
    date: str | None = None
    payee: str = "payment"
    from_account: str
    to_account: str
    amount: Amount
    pending: bool = False

    @model_validator(mode="after")
    def _distinct_accounts(self) -> "TransferIn":
        if self.from_account == self.to_account:
            raise ValueError("from_account and to_account must differ")
        return self


class TransferUpdateIn(TransferIn):
    """An add body plus the locator of the transfer to replace."""

    locator: str


@app.get("/api/transfer")
def get_transfer(locator: str) -> dict:
    with _api_errors():
        return projections.transfer_state(find_entry(_ledger().entries, locator))


@app.post("/api/transfer")
def post_transfer(body: TransferIn) -> dict:
    with _api_errors():
        _valid_name(body.from_account)
        _valid_name(body.to_account)

        date = _parse_date(body.date)
        entry_id = _sink().append_transfer(
            date=date,
            from_account=body.from_account,
            to_account=body.to_account,
            amount=_dec(body.amount),
            payee=body.payee,
            pending=body.pending,
        )
        _reconcile_sweeps(date)

    return _ok(f"appended transfer {body.from_account} -> {body.to_account}", id=entry_id)


@app.post("/api/transfer/update")
def post_transfer_update(body: TransferUpdateIn) -> dict:
    with _api_errors():
        _valid_name(body.from_account)
        _valid_name(body.to_account)

        old = find_entry(_ledger().entries, body.locator)
        old_date = old.date

        # The Venmo sweep is auto-managed, so a manual edit is discarded: re-derive it from the
        # month's activity instead, which reverts it to the computed value on save.
        if is_sweep([p.account for p in old.postings]):
            _reconcile_sweeps(old_date)
            return _ok("venmo sweep is auto-managed; reverted to computed value")

        new_date = _parse_date_opt(body.date)
        entry_id = _sink().update_transfer(
            body.locator,
            date=new_date,
            from_account=body.from_account,
            to_account=body.to_account,
            amount=_dec(body.amount),
            payee=body.payee,
            pending=body.pending,
        )
        _reconcile_sweeps(old_date, new_date or old_date)

    return _ok("updated transfer", id=entry_id)


# --- accounts ---


class AccountIn(BaseModel):
    kind: Literal["category", "funding_credit", "funding_cash"]
    leaf: str


@app.post("/api/account")
def post_account(body: AccountIn) -> dict:
    if not _LEAF_RE.match(body.leaf):
        raise HTTPException(status_code=400, detail=f"invalid account leaf: {body.leaf!r}")

    account = f"{_ACCOUNT_PREFIX[body.kind]}{body.leaf}"

    with _api_errors():
        _sink().open_account(account)

    return _ok(f"opened {account}", account=account)


# --- static frontend + entrypoint ---


class SPAStaticFiles(StaticFiles):
    """Serve the SvelteKit static build with client-side-routing awareness.

    Plain ``StaticFiles`` maps ``/dev`` to ``build/dev`` or ``build/dev/index.html`` — but the
    static adapter emits prerendered pages as ``build/dev.html``, so a *direct* URL visit (rather
    than in-app navigation) 404s. This resolves web page navigation by falling back, in order, to
    the prerendered ``<path>.html`` and then the SPA shell (``200.html``) so the client router can
    take over. The ``/api`` prefix is a reserved namespace: those requests never reach here (the
    API routes are registered first), and any that do get a real 404 rather than an HTML shell —
    so ``/api`` is never a usable page, but ``/api``-*prefixed* page names (e.g. ``/apiary``) still
    route normally.
    """

    async def get_response(self, path: str, scope: Scope):  # type: ignore[override]
        try:
            return await super().get_response(path, scope)

        except StarletteHTTPException as e:
            # Only web navigation gets the SPA treatment; the reserved /api namespace (the "api"
            # segment itself, not merely an "api"-prefixed name) stays a hard 404.
            if e.status_code != 404 or path == "api" or path.startswith("api/"):
                raise

            if path not in ("", ".") and not path.endswith(".html"):
                try:
                    return await super().get_response(path + ".html", scope)

                except StarletteHTTPException:
                    pass

            return await super().get_response("200.html", scope)


# Static frontend (the SvelteKit static-adapter build output, at _WEB_DIR) is mounted LAST so
# /api/* routes always win. Absence is tolerated (e.g. before `npm run build` in apps/web/).
if _WEB_DIR.is_dir():
    app.mount("/", SPAStaticFiles(directory=_WEB_DIR, html=True), name="web")


if __name__ == "__main__":
    import os

    import uvicorn

    # Port is overridable (env var, set by scripts/serve.py) so it can dodge a busy 8000.
    port = int(os.environ.get("YALA_API_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
