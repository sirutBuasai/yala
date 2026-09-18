"""Turning a failure into something a form can show.

An exception raised inside a write becomes a status code; a pydantic validation failure becomes one
readable sentence in the form's own vocabulary rather than a list of raw JSON paths.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException

# Pydantic error ``loc`` field name → the label the user sees, so a body-validation failure reads in
# the form's vocabulary rather than raw JSON keys.
FIELD_LABELS = {
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
    "name": "Name",
    "institution_name": "Institution",
    "account_name": "Account name",
}


def invalid(detail: str) -> HTTPException:
    """The refusal a bad request gets. Raised, never returned: ``raise invalid(...)``."""
    return HTTPException(status_code=422, detail=detail)


def not_found(detail: str) -> HTTPException:
    """The refusal a request naming something the ledger does not have gets."""
    return HTTPException(status_code=404, detail=detail)


@contextmanager
def api_errors() -> Iterator[None]:
    """Map exceptions raised in a write endpoint's body to HTTP errors: ``KeyError`` → 404 for an
    unknown locator, any other client-input problem → 422. An explicit ``HTTPException`` passes
    through unchanged.
    """
    try:
        yield

    except HTTPException:
        raise

    except KeyError as e:
        raise not_found(str(e))

    except Exception as e:
        raise invalid(str(e))


def humanize_error(err: dict) -> str:
    """Turn one pydantic error into a plain, field-labeled sentence."""
    field = next((str(p) for p in err.get("loc", ()) if p not in ("body", "query")), "")
    label = FIELD_LABELS.get(field, field or "value")
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
