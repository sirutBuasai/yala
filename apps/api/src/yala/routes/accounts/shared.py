"""What every account route needs: the kind an account belongs to, and the checks they all repeat.

Kept apart from :mod:`yala.routes.common` (which every route family shares) so an account-specific
rule has one home without leaking into the transaction or settings routes.
"""

from __future__ import annotations

from fastapi import HTTPException

from yala.ledger import Ledger
from yala.ledger.accounts import Kind, kind_of, sweep_referrers
from yala.ledger.naming import NAME_PARTS, PART_BY_FIELD
from yala.ledger.payroll import employers
from yala.routes.common import valid_label, valid_leaf, valid_money_account, valid_name
from yala.schema import KindName, TierName

__all__ = [
    "ALIAS_FIELDS",
    "NAMING_FIELDS",
    "RENAME_FIELDS",
    "KindName",
    "TierName",
    "carries",
    "known_employer",
    "labels_meta",
    "open_destination",
    "reject_referrers",
    "require_open",
    "resolve",
]

#: Every naming field, whatever the kind. Which of them apply is :func:`carries`.
NAMING_FIELDS = tuple(part.field for part in NAME_PARTS)

#: The fields that name the account: changing one is a rename (``/api/account/rename``).
RENAME_FIELDS = tuple(part.field for part in NAME_PARTS if part.names)

#: The fields that only shorten the name, and so are editable as metadata (``/api/account/meta``).
ALIAS_FIELDS = tuple(part.field for part in NAME_PARTS if not part.names)


def carries(kind: Kind, field: str) -> bool:
    """Whether ``kind`` has the naming field ``field`` to give.

    A cash account is named by its institution alone — there is only one of them per bank — so it
    has no product half to name or to shorten.
    """
    part = PART_BY_FIELD[field]

    return kind.named and (kind.product or not part.product)


def resolve(account: str) -> tuple[str, Kind]:
    """``account`` and the kind it belongs to, or 422 if this app doesn't manage it."""
    valid_name(account)
    kind = kind_of(account)
    if kind is None:
        raise HTTPException(status_code=422, detail=f"not a manageable account: {account!r}")
    return account, kind


def require_open(led: Ledger, account: str) -> None:
    if account not in led.declared_accounts():
        raise HTTPException(status_code=404, detail=f"unknown account: {account!r}")
    if not led.is_open(account):
        raise HTTPException(status_code=422, detail=f"{account} is closed")


def open_destination(led: Ledger, dest: str, account: str) -> str:
    """Validate ``dest`` as a distinct, currently-open asset/liability target for ``account`` —
    the shared check for every operation that moves a balance to another account."""
    valid_money_account(dest)
    if dest == account:
        raise HTTPException(status_code=422, detail="destination must differ from the account")
    if not led.is_open(dest):
        raise HTTPException(status_code=422, detail=f"destination is not an open account: {dest!r}")
    return dest


def reject_referrers(led: Ledger, account: str) -> None:
    """Refuse to close an account others sweep into, naming them so they can be repointed.

    Left alone, each referrer would sweep into a closed account, which reconcile can only skip — the
    passthrough would then quietly keep a balance that belongs somewhere else.
    """
    referrers = sweep_referrers(led, account)
    if referrers:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{', '.join(referrers)} sweep into {account}; "
                "point them elsewhere before closing it"
            ),
        )


def known_employer(led: Ledger, employer: str) -> str:
    valid_leaf(employer, "employer")
    if employer not in employers(led):
        raise HTTPException(status_code=422, detail=f"unknown or inactive employer: {employer!r}")
    return employer


def labels_meta(labels: list[str]) -> str:
    """The comma-joined ``labels`` value; each label is checked for a comma, which would split
    it."""
    return ",".join(valid_label(label) for label in labels)
