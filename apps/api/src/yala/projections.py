"""Read-side projections: a raw beancount entry → the editable-state dict a GET endpoint returns.

Each function shapes one located entry (spending transaction, paycheck, or transfer) for the edit
forms, and refuses one that doesn't match the expected shape.
"""

from __future__ import annotations

from decimal import Decimal

from beancount.core import data

from yala.ledger import payroll
from yala.ledger.constants import DEDUCTIONS, EXPENSES, INCOME
from yala.ledger.locators import entry_locator
from yala.routes.errors import invalid


def _entry_legs(entry: data.Transaction) -> list[tuple[str, Decimal]]:
    """The entry's ``(account, number)`` legs, skipping any without a resolved amount."""
    return [
        (p.account, p.units.number)
        for p in entry.postings
        if p.units is not None and p.units.number is not None
    ]


def txn_state(entry: data.Transaction) -> dict:
    """Editable state of one spending transaction (total bill, net share, funding, credits)."""
    legs = _entry_legs(entry)
    expenses = [(a, n) for a, n in legs if a.startswith(EXPENSES) and not a.startswith(DEDUCTIONS)]

    if len(expenses) != 1:
        raise invalid("not a single-category spending transaction")

    non_expense = [(a, n) for a, n in legs if not a.startswith(EXPENSES)]
    # The funding leg is the most-negative non-expense leg, narrowed to the declared funding account
    # when the meta is present, so funding and a credit sharing an account still resolve correctly.
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
        # ``amount`` is the whole bill; ``net_expense`` is what counts toward the category total.
        "amount": float(total),
        "net_expense": float(net_expense),
        "funding_account": funding_account,
        "bill": float(getattr(bill, "number", bill)) if bill is not None else None,
        "credits": credits,
    }


def paycheck_state(entry: data.Transaction, account_meta: dict[str, dict]) -> dict:
    """Editable state of one paycheck: employer, gross, deposit, deduction/contribution maps.

    Contributions are keyed by display label, matching the options the form offers, so an edit
    round-trips.
    """
    if not any(p.account.startswith(INCOME) for p in entry.postings):
        raise invalid("not a paycheck")

    legs = (
        (p.account, p.units.number, (p.meta or {}).get("label"))
        for p in entry.postings
        if p.units is not None and p.units.number is not None
    )
    s = payroll.summarize_paycheck(legs, account_meta)
    deposit = max(s.other, key=lambda o: o[1], default=None)

    return {
        "locator": entry_locator(entry),
        "date": entry.date.isoformat(),
        "payee": entry.payee or entry.narration or "paycheck",
        "employer": s.employer,
        "gross": float(s.gross),
        "deposit_account": deposit[0] if deposit else "",
        "deductions": {k: float(v) for k, v in s.deductions.items()},
        "contributions": {k: float(v) for k, v in s.contributions.items()},
    }


def transfer_state(entry: data.Transaction) -> dict:
    """Editable state of one transfer: from/to accounts and the amount moved."""
    legs = _entry_legs(entry)

    if len(legs) != 2:
        raise invalid("not a two-leg transfer")

    outflow, inflow = sorted(legs, key=lambda p: p[1])
    if outflow[1] >= 0 or inflow[1] <= 0:
        raise invalid("not a transfer")

    return {
        "locator": entry_locator(entry),
        "date": entry.date.isoformat(),
        "payee": entry.payee or entry.narration or "payment",
        "pending": entry.flag == "!",
        "from_account": outflow[0],
        "to_account": inflow[0],
        "amount": float(inflow[1]),
    }
