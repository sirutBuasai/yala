"""A rename rewrites the path across the ledger; an alias only shortens how it renders. Each
typeable name part renames on its own, so path and parts can't drift."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from yala.catalog import color_key
from yala.ledger import Ledger, cards
from yala.ledger.accounts import Kind, account_path, labels_of, named_path, stem_of, tier_of
from yala.ledger.constants import EMPLOYER_META, INCLUDES_PENDING_META, LABELS_META
from yala.ledger.naming import (
    ACCOUNT_NAME_META,
    INSTITUTION_NAME_META,
    PART_BY_FIELD,
    account_name,
    compose_stem,
    institution_of,
    name_parts,
)
from yala.ledger.plans import (
    institution_accounts,
    institution_rename_plan,
    institution_rename_problem,
    label_rename_plan,
    rename_plan,
    rename_problem,
)
from yala.ledger.rewrite import ledger_files
from yala.routes.accounts.shared import (
    ALIAS_FIELDS,
    RENAME_FIELDS,
    TierName,
    known_employer,
    labels_meta,
    require_applies,
    require_carries,
    require_open,
    resolve,
)
from yala.routes.common import (
    OptionalText,
    ledger,
    ok,
    sink,
    valid_composed_leaf,
    valid_label,
    valid_segment,
    valid_typed_name,
)
from yala.routes.errors import api_errors, invalid
from yala.user_settings import editing
from yala.user_settings import read as read_settings
from yala.user_settings.colors import CATEGORIES, INSTITUTIONS

router = APIRouter()


class AccountMetaIn(BaseModel):
    """Only sent fields change, null clearing one. The name halves are refused: they go through
    rename."""

    account: str
    institution_name: OptionalText = None
    account_name: OptionalText = None
    institution_alias: OptionalText = None
    account_alias: OptionalText = None
    employer: OptionalText = None
    labels: list[str] | None = None
    includes_pending: bool | None = None


@router.post("/api/account/meta")
def post_account_meta(body: AccountMetaIn) -> dict:
    """An institution's short form is set on every account held there, so it never reads two
    ways."""
    account, kind = resolve(body.account)
    led = ledger()
    require_open(led, account)

    for field in RENAME_FIELDS:
        if field in body.model_fields_set:
            raise invalid(f"{field} names the account: rename it with /api/account/rename")

    parts: dict[str, str | None] = {}
    values: dict[str, str | None] = {}

    for field in ALIAS_FIELDS:
        if field in body.model_fields_set:
            require_carries(kind, field)
            typed = getattr(body, field)
            parts[field] = valid_typed_name(typed, field) if typed else None

    if "employer" in body.model_fields_set:
        require_applies(kind, "employer", kind.scopable)
        values[EMPLOYER_META] = known_employer(led, body.employer) if body.employer else None

    if body.labels is not None:
        require_applies(kind, "labels", kind.labelled)
        values[LABELS_META] = labels_meta(body.labels) or None

    if body.includes_pending is not None:
        require_applies(kind, "includes_pending", kind.reconciled)
        values[INCLUDES_PENDING_META] = cards.pending_meta(body.includes_pending)

    if not parts and not values:
        raise invalid("no metadata given to change")

    shared = {f: v for f, v in parts.items() if PART_BY_FIELD[f].shared}
    institution = institution_of(led.account_meta().get(account))
    also = (
        [a for a in institution_accounts(led, institution) if a != account]
        if shared and institution
        else []
    )

    edits = {account: values | parts} | {a: dict(shared) for a in also}

    with api_errors():
        sink().set_metas(edits)

    updated = ledger().account_meta().get(account, {})
    return ok(
        f"updated {account}",
        account=account,
        name=account_name(account, updated),
        labels=labels_of(updated),
        also=also,
    )


class RelabelIn(BaseModel):
    account: str
    old: str
    new: str


@router.post("/api/account/relabel")
def post_account_relabel(body: RelabelIn) -> dict:
    """Also rewrites every logged contribution, or the line item's history splits in two."""
    account, kind = resolve(body.account)
    led = ledger()
    require_open(led, account)

    if not kind.labelled:
        raise invalid(f"a {kind.name} account offers no contribution labels")

    old, new = body.old, valid_label(body.new)
    labels = labels_of(led.account_meta().get(account))
    if old not in labels:
        raise invalid(f"{account} offers no label {old!r}")
    if new in labels:
        raise invalid(f"{account} already offers {new!r}")

    with api_errors():
        files = ledger_files(sink().ledger_dir)
        sink().rewrite_files(label_rename_plan(files, account, old, new))

    return ok(f"renamed {old} to {new}", account=account, old=old, new=new)


class AccountRenameIn(BaseModel):
    """Every part composes into the path, so any change rewrites it. ``institution_name`` renames
    every account held there."""

    account: str
    name: OptionalText = None
    institution_name: OptionalText = None
    account_name: OptionalText = None
    tier: TierName | None = None


def _renamed(led: Ledger, old: str, new: str, *, meta: dict[str, str | None] | None = None) -> dict:
    """Apply a single-account rename and describe it. ``meta`` records the renamed part, for one the
    ``open`` stores as well as composes into the path."""
    problem = rename_problem(led, old, new)
    if problem:
        raise invalid(problem)

    with api_errors():
        files = ledger_files(sink().ledger_dir)
        sink().rewrite_files(rename_plan(led, files, old, new, meta=meta))
        before, after = color_key(old, led.account_meta().get(old)), color_key(new, meta)
        if before and before[0] == CATEGORIES and after:
            _carry_color(CATEGORIES, before[1], after[1])

    return ok(
        f"renamed {old} to {new}",
        account=new,
        previous=old,
        name=account_name(new, ledger().account_meta().get(new, {})),
    )


def _carry_color(family: str, old: str, new: str) -> None:
    """A colour is keyed by name, so it follows the rename or it strands on a dead name."""
    with editing() as settings:
        settings.rename(family, old, new)


def _rename_institution(led: Ledger, account: str, kind: Kind, typed: str) -> dict:
    """An account with no institution just records it, which is how a hand-written account joins the
    scheme."""
    new = valid_typed_name(typed, "institution_name")
    old = institution_of(led.account_meta().get(account))

    if old is None:
        _, product = name_parts(led.account_meta().get(account))
        renamed = named_path(kind, new, product, tier_of(account))

        return _renamed(led, account, renamed, meta={INSTITUTION_NAME_META: new}) | {
            "institution_name": new
        }

    problem = institution_rename_problem(led, old, new, read_settings().colors[INSTITUTIONS])
    if problem:
        raise invalid(problem)

    with api_errors():
        files = ledger_files(sink().ledger_dir)
        changes, renames = institution_rename_plan(led, files, old, new)
        sink().rewrite_files(changes)
        _carry_color(INSTITUTIONS, old, new)

    now = renames.get(account, account)
    return ok(
        f"renamed institution {old} to {new}",
        account=now,
        previous=account,
        institution_name=new,
        name=account_name(now, ledger().account_meta().get(now, {})),
        also=sorted(target for source, target in renames.items() if source != account),
    )


def _renamed_stem(
    led: Ledger, old: str, kind: Kind, body: AccountRenameIn
) -> tuple[str, dict | None]:
    """Composed from the parts, so the path and the parts on the ``open`` always agree."""
    if body.account_name is not None:
        institution, _ = name_parts(led.account_meta().get(old))
        product = valid_typed_name(body.account_name, "account_name")
        composed = compose_stem(institution, product)

        typed = " ".join(filter(None, (institution, product)))

        return valid_segment(composed, "account_name", typed), {ACCOUNT_NAME_META: product}

    if body.name is not None:
        return valid_composed_leaf(body.name, "name"), None

    return stem_of(old, kind), None


@router.post("/api/account/rename")
def post_account_rename(body: AccountRenameIn) -> dict:
    """Rewrite every reference to an account across the ledger: its postings, assertions, pads,
    close, quoted metadata, and the plug it is paired with."""
    old, kind = resolve(body.account)
    led = ledger()

    given = {field: getattr(body, field) for field in ("name", *RENAME_FIELDS)}
    named = [field for field, value in given.items() if value is not None]

    if not named and body.tier is None:
        raise invalid("give a new name or a new tier")
    if len(named) > 1:
        raise invalid("rename one part of the name at a time")
    if body.tier is not None and not kind.tiered:
        raise invalid(f"a {kind.name} account has no tax tier to move between")
    # Setting the whole name would desync a named account's path from its parts; one with no parts
    # has nothing to desync, which keeps a hand-written account renameable.
    if body.name is not None and kind.named and any(name_parts(led.account_meta().get(old))):
        raise invalid(f"{old} is named in parts: rename institution_name or account_name")
    for field in RENAME_FIELDS:
        if given[field] is not None:
            require_carries(kind, field)

    if body.institution_name is not None:
        if body.tier is not None:
            raise invalid("rename the institution on its own")
        return _rename_institution(led, old, kind, body.institution_name)

    stem, meta = _renamed_stem(led, old, kind, body)

    return _renamed(led, old, account_path(kind, stem, body.tier or tier_of(old)), meta=meta)
