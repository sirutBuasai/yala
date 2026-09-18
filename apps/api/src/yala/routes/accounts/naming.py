"""What an account is called and what it offers: its metadata, and a real rename.

Two operations one word hides. A rename rewrites the account's path in every posting, assertion and
quoted value across the ledger, as does renaming a contribution label or an institution; an alias
only *shortens* what the path renders as. Every part of a name typeable when an account is opened
can be renamed here on its own, so the path and the parts it was composed from cannot drift apart.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from yala.ledger import Ledger
from yala.ledger.accounts import Kind, account_path, labels_of, named_path, stem_of, tier_of
from yala.ledger.constants import EMPLOYER_META, LABELS_META
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

router = APIRouter()


class AccountMetaIn(BaseModel):
    """Edit what an account is *called* and what it offers, not what it is named.

    Only the fields the request sends are touched, and an explicit null clears one. The two name
    halves are refused here: they name the account, so they are renamed.
    """

    account: str
    institution_name: OptionalText = None
    account_name: OptionalText = None
    institution_alias: OptionalText = None
    account_alias: OptionalText = None
    employer: OptionalText = None
    labels: list[str] | None = None


@router.post("/api/account/meta")
def post_account_meta(body: AccountMetaIn) -> dict:
    """Set an account's descriptive metadata: how its name shortens, which employer it is scoped to,
    and which contribution labels it offers.

    A short form belonging to the institution is set on every account held there, which is what
    keeps one institution from reading two ways.
    """
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
    """Rename one contribution label, in the account's ``labels`` meta and in every contribution
    already logged under it, which otherwise splits one line item's history in two.
    """
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


# --- rename / move ---


class AccountRenameIn(BaseModel):
    """Rename an account, in whichever of its parts the kind is named by.

    The fields mirror the ones that named it when it was opened, each editable on its own, and all
    are one operation: every part composes into the path, so changing one rewrites the path.
    ``institution_name`` differs in scope, not in kind — it is composed into every path built from
    it, so renaming it renames every account held there.
    """

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

    return ok(
        f"renamed {old} to {new}",
        account=new,
        previous=old,
        name=account_name(new, ledger().account_meta().get(new, {})),
    )


def _rename_institution(led: Ledger, account: str, kind: Kind, typed: str) -> dict:
    """Rename the institution ``account`` is held at, and with it every account held there.

    An account declaring no institution has nothing to cascade to: naming its institution renames
    that one account and records the institution on it, which is how a hand-written account joins
    the scheme.
    """
    new = valid_typed_name(typed, "institution_name")
    old = institution_of(led.account_meta().get(account))

    if old is None:
        _, product = name_parts(led.account_meta().get(account))
        renamed = named_path(kind, new, product, tier_of(account))

        return _renamed(led, account, renamed, meta={INSTITUTION_NAME_META: new}) | {
            "institution_name": new
        }

    problem = institution_rename_problem(led, old, new)
    if problem:
        raise invalid(problem)

    with api_errors():
        files = ledger_files(sink().ledger_dir)
        changes, renames = institution_rename_plan(led, files, old, new)
        sink().rewrite_files(changes)

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
    """The path segment the rename asks for, and the name part to record beside it.

    Composed from the parts rather than taken as typed, so the path and the parts stored on the
    ``open`` always describe the same name.
    """
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
    # A named account's path is composed from its parts, so setting the whole name at once would
    # leave the two describing different names. One recording no parts has nothing to desync, which
    # is what keeps a hand-written account renameable.
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
