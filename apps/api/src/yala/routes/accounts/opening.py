"""Reading the account sets, and opening a new account of any kind."""

from __future__ import annotations

from collections.abc import Callable
from typing import NamedTuple

from fastapi import APIRouter
from pydantic import BaseModel, Field

from yala.catalog import account_lists
from yala.ledger import Ledger
from yala.ledger.accounts import KINDS_BY_NAME, Kind, account_path, plug_account
from yala.ledger.constants import EMPLOYER_META, LABELS_META
from yala.ledger.naming import account_name, compose_stem, shared_parts
from yala.ledger.plans import institution_accounts
from yala.routes.accounts.shared import (
    NAMING_FIELDS,
    KindName,
    TierName,
    carries,
    labels_meta,
    require_applies,
)
from yala.routes.common import (
    MAX_LEGS,
    OptionalText,
    ledger,
    ok,
    parse_date,
    sink,
    valid_composed_leaf,
    valid_leaf,
    valid_name,
    valid_segment,
    valid_typed_name,
)
from yala.routes.errors import api_errors, invalid
from yala.sink import FileLedgerSink

router = APIRouter()


@router.get("/api/accounts")
def get_accounts() -> dict:
    # Shared with the snapshot: the frontend reads whichever source is up and must not be able to
    # tell them apart.
    return account_lists(ledger()).model_dump(mode="json")


@router.get("/api/investment/value")
def get_investment_value(account: str, date: str | None = None) -> dict:
    """USD value of an account's holdings as of ``date``, today if omitted. Refused when a held
    ticker has no price by then.

    Dated because a retirement's legs must sum to the value *on the day it is dated*, so a form
    offering a past date has to ask for the figure that applies then.
    """
    valid_name(account)
    with api_errors():
        as_of = parse_date(date) if date else None
        return {"account": account, "value": float(ledger().value(account, as_of))}


# --- open ---


class NamedAccountIn(BaseModel):
    """The naming half of any request that opens an account.

    Every form sends each part of the name as a person writes it and the server composes the path
    from them, recording the parts, so the display name and the stored name cannot disagree.
    ``name`` carries the whole name for a kind not named after where it is held.
    """

    name: OptionalText = None
    institution_name: OptionalText = None
    account_name: OptionalText = None
    institution_alias: OptionalText = None
    account_alias: OptionalText = None

    @property
    def naming_meta(self) -> dict[str, str]:
        """The name parts to record, dropping the ones left unset. Field name and meta key are the
        same word, so nothing here translates between them.
        """
        typed = {field: getattr(self, field) for field in NAMING_FIELDS}

        return {field: valid_typed_name(value, field) for field, value in typed.items() if value}

    def stem(self) -> str:
        """The path segment this request's name composes to, by whichever form it used."""
        if self.institution_name:
            institution = valid_typed_name(self.institution_name, "institution_name")
            product = (
                valid_typed_name(self.account_name, "account_name") if self.account_name else None
            )
            composed = compose_stem(institution, product)

            typed = " ".join(filter(None, (institution, product)))

            return valid_segment(composed, "institution_name", typed)

        if self.name:
            return valid_composed_leaf(self.name, "name")

        raise invalid("give either a name or an institution")


class AccountIn(NamedAccountIn):
    """Open an account of any kind. ``kind`` decides the prefix, the naming rule, and what else is
    written beside the ``open``."""

    kind: KindName
    date: str | None = None
    tier: TierName | None = None
    employer: OptionalText = None
    labels: list[str] = Field(default=[], max_length=MAX_LEGS)


class _OpenPlan(NamedTuple):
    """A resolved open request: the account, the meta to report back, and the writes it takes."""

    account: str
    meta: dict[str, str]
    write: Callable[[FileLedgerSink], None]


def _reject_inapplicable(body: AccountIn, kind: Kind) -> None:
    """Report a field the named kind of account cannot carry."""
    applies = {
        "tier": kind.tiered,
        "employer": kind.scopable,
        "labels": kind.labelled,
        **{field: carries(kind, field) for field in NAMING_FIELDS},
    }
    for field, applicable in applies.items():
        if field in body.model_fields_set:
            require_applies(kind, field, applicable)


def _reject_declared(led: Ledger, account: str) -> None:
    """Refuse a name the ledger already declares.

    Beancount rejects a second ``open``, so without this the strict reload fails and the caller gets
    a parser message instead of the one thing it needs to know: that a closed account is reopened.
    """
    if account not in led.declared_accounts():
        return

    reopen = "" if led.is_open(account) else "; reopen it with /api/account/reopen"
    raise invalid(f"{account} already exists{reopen}")


def _inherited_meta(led: Ledger, institution: str | None) -> dict[str, str]:
    """The shared name parts an account joining ``institution`` takes from the ones already there.

    A short form belongs to the institution, not to one account held at it, so a new account that
    did not inherit it would leave one institution reading two ways.
    """
    if not institution:
        return {}

    meta = led.account_meta()
    for held in institution_accounts(led, institution):
        inherited = shared_parts(meta.get(held))
        if inherited:
            return inherited

    return {}


def _open_plan(body: AccountIn) -> _OpenPlan:
    """Resolve an open request into the account it names and the writes that declare it.

    The plug shares the account's open date: a snapshot pads the day before the date it asserts, so
    a plug opened later could not absorb the first one.
    """
    kind = KINDS_BY_NAME[body.kind]
    _reject_inapplicable(body, kind)

    if kind.tiered and body.tier is None:
        raise invalid(f"tier is required for a {kind.name} account")

    account = account_path(kind, body.stem(), body.tier)

    led = ledger()
    _reject_declared(led, account)

    meta = _inherited_meta(led, body.institution_name) | body.naming_meta
    if body.employer:
        meta[EMPLOYER_META] = valid_leaf(body.employer, "employer")
    if body.labels:
        meta[LABELS_META] = labels_meta(body.labels)

    date = parse_date(body.date)
    plug = plug_account(account) if kind.plugged else None

    def write(s: FileLedgerSink) -> None:
        s.open_account(account, date, currency=kind.currency, meta=meta)
        if plug is not None:
            s.open_account(plug, date, currency=None)
            s.assert_balance(account, "0.00", date=date)

    return _OpenPlan(account, meta, write)


@router.post("/api/account")
def post_account(body: AccountIn) -> dict:
    """Open an account. The response carries the resolved display name, so a form can confirm what
    the account will be called without reimplementing the naming rule.
    """
    plan = _open_plan(body)

    with api_errors():
        plan.write(sink())

    return ok(
        f"opened {plan.account}",
        account=plan.account,
        name=account_name(plan.account, plan.meta),
    )
