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

from beancount.core import data
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AfterValidator, BaseModel, Field, model_validator
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from yala import config, projections
from yala.builder import build_dict
from yala.ledger import Ledger, payroll
from yala.ledger.constants import (
    ASSETS,
    CASH,
    CREDIT_CARDS,
    DEDUCTIONS,
    EQUITY,
    EXPENSES,
    INVESTMENTS,
    LIABILITIES,
    SWEEP_META,
)
from yala.ledger.entities import leaf
from yala.ledger.locators import find_entry
from yala.ledger.sweep import is_sweep, reconcile_months, resolve_terminal, retire_passthrough
from yala.money import round_cents
from yala.sink import FileLedgerSink

app = FastAPI(title="Yala")

_NAME_RE = re.compile(r"^[A-Za-z0-9:-]+$")
_LEAF_RE = re.compile(r"^[A-Za-z0-9-]+$")
# One account-path segment: beancount requires each to start uppercase (lowercase = parse error).
_SEGMENT_RE = re.compile(r"^[A-Z][A-Za-z0-9-]*$")
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")  # C0 control chars incl. newline/tab, and DEL
_WEB_DIR = Path(__file__).resolve().parents[4] / "apps" / "web" / "build"

_ACCOUNT_PREFIX: dict[str, str] = {
    "category": EXPENSES,
    "funding_credit": CREDIT_CARDS,
    "funding_cash": CASH,
}

# Pydantic error ``loc`` field name → the label the user sees in the form, so a body-validation
# failure reads in the form's vocabulary rather than raw JSON keys.
_FIELD_LABELS = {
    "payee": "Title",
    "amount": "Amount",
    "gross": "Gross",
    "category": "Category",
    "funding_account": "Account",
    "deposit_account": "Deposit account",
    "from_account": "From account",
    "to_account": "To account",
    "employer": "Employer",
    "deductions": "Deductions",
    "contributions": "Contributions",
    "credits": "Reimbursements",
    "leaf": "Name",
}

# Sanity ceilings. Money is bounded well below float's precision cliff (2^53 cents) so cent-exact
# arithmetic stays exact; free text is single-line and short; leg lists are capped so one request
# can't balloon a ledger file. These are defense-in-depth, not domain rules.
MAX_AMOUNT = 1e12
MAX_TEXT = 200
MAX_LEGS = 100


# --- request field types ---
#
# ``Text`` references ``_clean_text``, so the validator is defined first;


def _clean_text(value: str) -> str:
    """Normalize a free-text field (payee/note) to a single trimmed line.

    The ledger is a line-based file, so a newline or control char in a payee would corrupt it (or
    silently smuggle content into the stored string). We strip control chars, collapse internal
    whitespace, trim, and bound the length — rejecting an all-blank value outright.
    """
    text = " ".join(_CTRL_RE.sub(" ", value).split())
    if not text:
        raise ValueError("must not be blank")
    if len(text) > MAX_TEXT:
        raise ValueError(f"must be at most {MAX_TEXT} characters")
    return text


# A transaction/transfer amount must be positive; a credit or payroll line item may be zero
# (e.g. a $0 deduction) but never negative. Both are finite and bounded (see MAX_AMOUNT).
Amount = Annotated[float, Field(gt=0, le=MAX_AMOUNT, allow_inf_nan=False)]
NonNegAmount = Annotated[float, Field(ge=0, le=MAX_AMOUNT, allow_inf_nan=False)]
# A required, single-line free-text field.
Text = Annotated[str, AfterValidator(_clean_text)]


# --- shared helpers ---


def _ledger() -> Ledger:
    return Ledger(config.MAIN_LEDGER).load()


def _sink() -> FileLedgerSink:
    return FileLedgerSink(config.LEDGER_DIR)


@contextmanager
def _api_errors() -> Iterator[None]:
    """Map exceptions from a write endpoint body to HTTP errors (``KeyError`` → 404 for an
    unknown locator, any other client-input problem → 422). Explicit ``HTTPException``\\ s (e.g. a
    409 sweep conflict) pass through unchanged. Every write endpoint wraps its body here so the
    mapping lives in one place."""
    try:
        yield

    except HTTPException:
        raise

    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


def _dec(value: float) -> Decimal:
    """Decimal from a request float, via str so 19.99 doesn't become 19.9900000001."""
    return Decimal(str(value))


def _ok(message: str, **extra) -> dict:
    """A write endpoint's success body: ``{"ok": True, "message": ...}`` plus any extras."""
    return {"ok": True, "message": message, **extra}


def _humanize_error(err: dict) -> str:
    """Turn one pydantic error into a plain, field-labeled sentence."""
    field = next((str(p) for p in err.get("loc", ()) if p not in ("body", "query")), "")
    label = _FIELD_LABELS.get(field, field or "value")
    etype, ctx = err.get("type", ""), err.get("ctx") or {}

    def num(key: str) -> str:  # so a whole-number bound reads "0", not "0.0"
        v = ctx.get(key, 0)
        return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)

    phrase = {
        "missing": "is required",
        "greater_than": f"must be greater than {num('gt')}",
        "greater_than_equal": f"must be at least {num('ge')}",
        "less_than_equal": f"must be at most {num('le')}",
        "too_long": "has too many items",
        "finite_number": "must be a finite number",
    }.get(etype)

    if phrase is None:
        # value_error carries our own AfterValidator/model_validator message; keep it verbatim.
        phrase = (err.get("msg") or "is invalid").removeprefix("Value error, ")

    return f"{label} {phrase}"


@app.exception_handler(RequestValidationError)
async def on_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Return a request body/query validation failure as a single clear ``detail`` string (still
    HTTP 422), so the frontend shows one readable sentence, not pydantic's raw error list."""
    messages = dict.fromkeys(_humanize_error(e) for e in exc.errors())
    detail = "; ".join(messages) or "invalid request"
    return JSONResponse(status_code=422, content={"detail": detail})


def _valid_name(value: str) -> str:
    if not _NAME_RE.match(value):
        raise HTTPException(status_code=422, detail=f"invalid account/category name: {value!r}")
    return value


def _valid_transfer_account(value: str) -> str:
    """A transfer moves money between balance-sheet accounts, so its legs must be an asset or a
    liability — never an ``Expenses``/``Income`` account (that would be spending or income, not a
    transfer)."""
    _valid_name(value)
    if not value.startswith((ASSETS, LIABILITIES)):
        raise HTTPException(
            status_code=422,
            detail=f"transfer accounts must be an asset or liability account: {value!r}",
        )
    return value


def _parse_date(value: str | None) -> dt.date:
    """Parse an ISO date, defaulting to today when omitted (used by add endpoints)."""
    if not value:
        return dt.date.today()

    try:
        return dt.date.fromisoformat(value)

    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid date: {value!r}")


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


def _reject_if_sweep(entry: data.Transaction) -> None:
    """A passthrough sweep is auto-managed — recomputed from the month's activity — so a manual
    edit or delete is refused rather than silently overwritten or re-created."""
    if is_sweep([p.account for p in entry.postings], _ledger()):
        raise HTTPException(
            status_code=409,
            detail="This sweep is auto-managed and can't be edited or deleted.",
        )


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
        "investment_accounts": ledger.active_accounts(INVESTMENTS),
        "sweeps": {a: m[SWEEP_META] for a, m in ledger.account_meta().items() if m.get(SWEEP_META)},
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


# A credit is money received back — strictly positive; the net share falls out as bill − Σcredits.
class CreditIn(BaseModel):
    account: str
    amount: Amount


class TransactionIn(BaseModel):
    date: str | None = None
    payee: Text
    amount: Amount
    category: str
    funding_account: str
    pending: bool = False
    credits: list[CreditIn] = Field(default=[], max_length=MAX_LEGS)


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
    """Delete a located entry (spending transaction, paycheck, or transfer) from the ledger."""
    with _api_errors():
        entry = find_entry(_ledger().entries, body.locator)
        _reject_if_sweep(entry)
        _sink().delete_entry(body.locator)
        _reconcile_sweeps(entry.date)

    return _ok(f"deleted entry {body.locator}")


# --- paychecks ---


class PaycheckIn(BaseModel):
    date: str | None = None
    employer: str
    gross: Amount
    deductions: dict[str, NonNegAmount] = Field(default={}, max_length=MAX_LEGS)
    contributions: dict[str, NonNegAmount] = Field(default={}, max_length=MAX_LEGS)
    deposit_account: str
    payee: Text = "paycheck"


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
            status_code=422, detail=f"unknown or inactive employer: {body.employer!r}"
        )

    income_account = f"{payroll.SALARY}{body.employer}"
    deduction_legs: list[tuple[str, Decimal]] = []
    contribution_legs: list[tuple[str, str | None, Decimal]] = []

    for label, amount in body.deductions.items():
        option = payroll.resolve(ledger, "deduction", label, body.employer)
        if option is None:
            raise HTTPException(
                status_code=422, detail=f"no deduction {label!r} for {body.employer}"
            )
        deduction_legs.append((option.account, _dec(amount)))

    for label, amount in body.contributions.items():
        option = payroll.resolve(ledger, "contribution", label, body.employer)
        if option is None:
            raise HTTPException(
                status_code=422, detail=f"no contribution {label!r} for {body.employer}"
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
    payee: Text = "payment"
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
        _valid_transfer_account(body.from_account)
        _valid_transfer_account(body.to_account)

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
        _valid_transfer_account(body.from_account)
        _valid_transfer_account(body.to_account)

        old = find_entry(_ledger().entries, body.locator)
        _reject_if_sweep(old)
        old_date = old.date

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
        raise HTTPException(
            status_code=422,
            detail=f"account name must use only letters, numbers, or hyphens: {body.leaf!r}",
        )

    account = f"{_ACCOUNT_PREFIX[body.kind]}{body.leaf}"

    with _api_errors():
        _sink().open_account(account)

    return _ok(f"opened {account}", account=account)


class AccountCloseIn(BaseModel):
    account: str


@app.post("/api/account/close")
def post_account_close(body: AccountCloseIn) -> dict:
    """Close a spending category (an ``Expenses:*`` account, excluding the Deductions subtree) or a
    bank/cash account (``Assets:Cash:*``). The account drops out of the pickers but historical
    entries still report against it. Any account is closeable, including passthroughs like Venmo or
    Wealthfront — use ``/api/account/drain-close`` first if it still carries a balance."""
    account = _valid_name(body.account)

    is_category = account.startswith(EXPENSES) and not account.startswith(DEDUCTIONS)
    is_bank = account.startswith(CASH)
    if not (is_category or is_bank):
        raise HTTPException(
            status_code=422, detail=f"not a spending category or bank account: {account!r}"
        )

    with _api_errors():
        sink = _sink()
        # Close first (so a future-dated auto-sweep makes this fail cleanly, nudging drain-close),
        # then drop any ``sweep_to`` so reconciliation stops tracking the now-closed account.
        sink.close_account(account)
        if _ledger().account_meta().get(account, {}).get(SWEEP_META):
            sink.set_account_meta(account, SWEEP_META, None)

    return _ok(f"closed {account}", account=account)


# --- passthrough sweep configuration + account retirement ---


class SweepIn(BaseModel):
    account: str
    dest: str | None = None  # a null/empty dest clears the passthrough


@app.post("/api/account/sweep")
def post_account_sweep(body: SweepIn) -> dict:
    """Declare (or, with an empty ``dest``, clear) ``account`` as a passthrough that sweeps to
    ``dest``. ``dest`` must be an open asset/liability account other than ``account`` and must not
    create a sweep cycle."""
    account = _valid_transfer_account(body.account)

    if not body.dest:
        with _api_errors():
            _sink().set_account_meta(account, SWEEP_META, None)
        return _ok(f"cleared sweep for {account}", account=account)

    dest = _valid_transfer_account(body.dest)
    if dest == account:
        raise HTTPException(status_code=422, detail="a passthrough can't sweep to itself")

    ledger = _ledger()
    if dest not in ledger.active_accounts():
        raise HTTPException(
            status_code=422, detail=f"sweep destination is not an open account: {dest!r}"
        )

    # Reject a configuration that would cycle (e.g. A→B→A) before writing it.
    edges = {a: m[SWEEP_META] for a, m in ledger.account_meta().items() if m.get(SWEEP_META)}
    edges[account] = dest
    try:
        resolve_terminal(edges, account)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    with _api_errors():
        _sink().set_account_meta(account, SWEEP_META, dest)

    return _ok(f"{account} now sweeps to {dest}", account=account, dest=dest)


class DrainCloseIn(BaseModel):
    account: str
    destination: str
    date: str | None = None


@app.post("/api/account/drain-close")
def post_account_drain_close(body: DrainCloseIn) -> dict:
    """Retire a balance-sheet account: transfer its residual balance to a caller-chosen
    ``destination``, then close it. Leaves a zero balance so it never lingers in net worth."""
    account = _valid_transfer_account(body.account)
    destination = _valid_transfer_account(body.destination)
    if destination == account:
        raise HTTPException(
            status_code=422, detail="drain destination must differ from the account"
        )

    date = _parse_date(body.date)

    with _api_errors():
        sink = _sink()
        ledger = _ledger()
        if destination not in ledger.active_accounts():
            raise HTTPException(
                status_code=422, detail=f"destination is not an open account: {destination!r}"
            )

        # A passthrough is kept near-zero by a month-end sweep; retire that first (delete the
        # sweep, drop sweep_to) so its balance reflects only real activity and nothing is left
        # dated after the close. Then the drain below is its true final sweep.
        retire_passthrough(sink, account, date)
        ledger = _ledger()

        bal = ledger.balance(account, date)
        if bal != 0:
            # A positive asset balance moves out; a negative one (liability) is paid in.
            from_account, to_account = (account, destination) if bal > 0 else (destination, account)
            sink.append_transfer(
                date=date,
                from_account=from_account,
                to_account=to_account,
                amount=abs(bal),
                payee=f"close {leaf(account)}",
            )

        sink.close_account(account, date)
        _reconcile_sweeps(date)

    return _ok(f"drained and closed {account}", account=account, drained=float(bal))


# --- investment accounts ---


def _invest_plug(account: str) -> str:
    """The dedicated adjustments plug paired with a share account, mirroring its path under the
    subtree (``Assets:Investments:TaxAdvantaged:HSA:Fidelity`` →
    ``Equity:Adjustments:Investments:HSA:Fidelity``)."""
    rest = account[len(INVESTMENTS) :].split(":", 1)[1]  # drop the Taxable/TaxAdvantaged segment
    return f"{EQUITY}Adjustments:Investments:{rest}"


def _valid_leaf_list(values: list[str], field: str) -> None:
    for v in values:
        if not _LEAF_RE.match(v):
            raise HTTPException(status_code=422, detail=f"invalid {field}: {v!r}")


class InvestmentIn(BaseModel):
    subtree: Literal["Taxable", "TaxAdvantaged"]
    name: str  # may be nested, e.g. "HSA:Fidelity"
    holds_shares: bool = True  # False = a USD-only, tickerless plan (opened USD-constrained)
    employer: str | None = None
    labels: list[str] = Field(default=[], max_length=MAX_LEGS)


@app.post("/api/account/investment")
def post_investment(body: InvestmentIn) -> dict:
    """Open an investment account under Taxable/TaxAdvantaged. Share accounts open unconstrained
    (hold many tickers + USD) and get a ``0.00 USD`` genesis seed plus a paired adjustments plug;
    a USD-only plan opens USD-constrained with neither. Payroll-contributable accounts carry
    ``employer``/``labels`` meta."""
    if not all(_SEGMENT_RE.match(s) for s in body.name.split(":")):
        raise HTTPException(
            status_code=422,
            detail=f"invalid name (segments must start uppercase): {body.name!r}",
        )
    _valid_leaf_list(body.labels, "label")
    if body.employer:
        _valid_leaf_list([body.employer], "employer")

    account = f"{INVESTMENTS}{body.subtree}:{body.name}"
    meta: dict[str, str] = {}
    if body.employer:
        meta["employer"] = body.employer
    if body.labels:
        meta["labels"] = ",".join(body.labels)

    with _api_errors():
        sink = _sink()
        sink.open_account(account, currency=None if body.holds_shares else "USD", meta=meta)
        if body.holds_shares:
            sink.assert_balance(account, "0.00", "USD")
            sink.open_account(_invest_plug(account), currency=None)

    return _ok(f"opened {account}", account=account)


@app.get("/api/account/value")
def get_account_value(account: str) -> dict:
    """USD value of an account's holdings today (Σ shares × latest price + USD). Used to prefill the
    investment-retirement split. 422 if a held ticker has no price."""
    account = _valid_name(account)
    with _api_errors():
        return {"account": account, "value": float(_ledger().value(account))}


class DrainLeg(BaseModel):
    destination: str
    amount: Amount


class InvestmentCloseIn(BaseModel):
    account: str
    legs: list[DrainLeg] = Field(default=[], max_length=MAX_LEGS)
    date: str | None = None


@app.post("/api/account/investment-close")
def post_investment_close(body: InvestmentCloseIn) -> dict:
    """Retire an investment account: value its holdings in USD (latest price on/before the date),
    split that total across the given USD legs, liquidate + close the account (and its plug). The
    legs must sum to the account's USD value (both zero for an empty account)."""
    account = _valid_name(body.account)
    if not account.startswith(INVESTMENTS):
        raise HTTPException(status_code=422, detail=f"not an investment account: {account!r}")

    date = _parse_date(body.date)

    with _api_errors():
        ledger = _ledger()
        for leg in body.legs:
            _valid_transfer_account(leg.destination)
            if leg.destination == account:
                raise HTTPException(
                    status_code=422, detail="a drain destination must differ from the account"
                )
            if leg.destination not in ledger.active_accounts():
                raise HTTPException(
                    status_code=422,
                    detail=f"destination is not an open account: {leg.destination!r}",
                )

        value = ledger.value(account, date)  # LedgerError (no price) → 422 via _api_errors
        legs_total = round_cents(sum((_dec(leg.amount) for leg in body.legs), Decimal(0)))
        if legs_total != value:
            raise HTTPException(
                status_code=422,
                detail=f"legs must sum to the account's USD value {value}; got {legs_total}",
            )

        plug = _invest_plug(account)
        plug = plug if plug in ledger.active_accounts() else None
        _sink().close_investment(
            account, date, [(leg.destination, _dec(leg.amount)) for leg in body.legs], plug
        )
        _reconcile_sweeps(date)

    return _ok(f"retired {account}", account=account, value=float(value))


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
