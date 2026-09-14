"""What a rename or a reopen would rewrite, planned before anything is written.

An account's name *is* the path in every posting, assertion, pad and quoted meta value, so changing
it means rewriting text across every file; a reopen is the one change the ledger cannot express as
a further entry, so it means deleting text. Both are planned here as ``{path: new text}`` and given
to :meth:`yala.sink.FileLedgerSink.rewrite_files`, which applies the set atomically.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import TYPE_CHECKING

from beancount.core import data

from yala.ledger import institutions, rewrite
from yala.ledger.accounts import (
    KINDS_BY_NAME,
    declared_family,
    kind_of,
    named_path,
    open_entry,
    plug_account,
    tier_of,
)
from yala.ledger.constants import CLOSED_WITH_META, EMPLOYER_META, LABEL_META, LABELS_META
from yala.ledger.locators import source_of
from yala.ledger.naming import INSTITUTION_NAME_META, institution_of, name_parts
from yala.ledger.paths import leaf

if TYPE_CHECKING:
    from yala.ledger.core import Ledger


def rename_problem(ledger: "Ledger", old: str, new: str) -> str | None:
    """Why ``old`` cannot be renamed to ``new``, or ``None`` if it can.

    A rename moves an account, it does not change what it is: the two paths must belong to the same
    kind, which is what lets an investment change tax tier while refusing to turn a category into a
    bank account. Any name already declared is refused whether or not it is still open, so a rename
    can never merge two accounts — least of all two employers.
    """
    if old == new:
        return "the new name matches the current one"

    old_kind, new_kind = kind_of(old), kind_of(new)
    if old_kind is None:
        return f"{old} is not a renameable account"
    if new_kind is not old_kind:
        return f"{new} is not the same kind of account as {old}"

    declared = set(ledger.declared_accounts())
    if old not in declared:
        return f"{old} does not exist"

    family = declared_family(ledger, old)
    clashes = sorted(new + a[len(old) :] for a in family if new + a[len(old) :] in declared)
    if clashes:
        return f"{', '.join(clashes)} already exists; renaming would merge two accounts"

    return None


def rename_map(ledger: "Ledger", old: str, new: str) -> dict[str, str]:
    """Every account path the rename rewrites: ``old`` and its descendants, plus the plug each one
    is paired with, so a renamed account keeps the plug its snapshots pad into."""
    renames = {a: new + a[len(old) :] for a in declared_family(ledger, old)}

    declared = set(ledger.declared_accounts())
    for source, target in list(renames.items()):
        old_plug, new_plug = plug_account(source), plug_account(target)
        if old_plug in declared and new_plug is not None:
            renames[old_plug] = new_plug

    return renames


def rename_plan(
    ledger: "Ledger",
    files: Mapping[Path, str],
    old: str,
    new: str,
    *,
    meta: Mapping[str, str | None] | None = None,
) -> dict[Path, str]:
    """The files a rename rewrites, and their new text.

    An employer's name is duplicated — once as the account path, once as the bare string that scopes
    contributions and deductions to it — so both are rewritten together. ``meta`` sets keys on the
    renamed account's ``open`` in the same commit, which is how a name part that is stored as well
    as composed into the path moves with it.
    """
    renames = rename_map(ledger, old, new)
    employer_rename = kind_of(old) is KINDS_BY_NAME["employer"]

    staged = dict(files)
    if meta:
        opened = open_entry(ledger, old)
        if opened is not None:
            path, lineno = source_of(opened)
            staged[path] = rewrite.set_meta_block(staged[path], lineno, meta)

    after: dict[Path, str] = {}
    for path, text in staged.items():
        updated = rewrite.rename_accounts(text, renames)
        if employer_rename:
            updated = rewrite.rename_meta_value(updated, EMPLOYER_META, leaf(old), leaf(new))
        after[path] = updated

    return rewrite.changed_only(files, after)


# --- renaming an institution ---


def institution_accounts(ledger: "Ledger", institution: str) -> list[str]:
    """Every declared account held at ``institution``, closed ones included.

    Closed ones too: their names still record the institution, and a rename that skipped them would
    leave the old name in the history.
    """
    meta = ledger.account_meta()

    return sorted(
        a for a in ledger.declared_accounts() if institution_of(meta.get(a)) == institution
    )


def institution_rename_map(ledger: "Ledger", old: str, new: str) -> dict[str, str]:
    """Every account path renaming institution ``old`` to ``new`` rewrites.

    The institution's name is duplicated into every path composed from it, so all of them move
    together. An account this app does not manage, or one whose product half was never recorded and
    so cannot be recomposed, keeps its path: only its metadata follows.
    """
    meta = ledger.account_meta()
    renames: dict[str, str] = {}

    for account in institution_accounts(ledger, old):
        kind = kind_of(account)

        if kind is None:
            continue

        _, product = name_parts(meta.get(account))

        if kind.product and product is None:
            continue

        renamed = named_path(kind, new, product, tier_of(account))
        renames |= rename_map(ledger, account, renamed)

    return renames


def institution_rename_problem(ledger: "Ledger", old: str, new: str) -> str | None:
    """Why institution ``old`` cannot be renamed to ``new``, or ``None`` if it can."""
    if old == new:
        return "the new name matches the current one"

    if not institution_accounts(ledger, old):
        return f"no account is held at {old}"

    if new in institutions.named(ledger.entries):
        return f"{new} is already declared; renaming would merge two institutions"

    renames = institution_rename_map(ledger, old, new)
    declared = set(ledger.declared_accounts())
    clashes = sorted(t for t in renames.values() if t in declared and t not in renames)

    if clashes:
        return f"{', '.join(clashes)} already exists; renaming would merge two accounts"

    return None


def institution_rename_plan(
    ledger: "Ledger", files: Mapping[Path, str], old: str, new: str
) -> tuple[dict[Path, str], dict[str, str]]:
    """The files renaming an institution rewrites, and the account renames it applies.

    Three places hold the name: every path composed from it, the ``institution_name`` meta that
    scopes an alias and picks the colour, and the colour swatch keyed by it. Rewriting fewer than
    all three leaves the institution split in two.
    """
    renames = institution_rename_map(ledger, old, new)

    after: dict[Path, str] = {}
    for path, text in files.items():
        updated = rewrite.rename_accounts(text, renames)
        updated = rewrite.rename_meta_value(updated, INSTITUTION_NAME_META, old, new)
        after[path] = rewrite.rename_custom_value(updated, institutions.INSTITUTION_TYPE, old, new)

    return rewrite.changed_only(files, after), renames


def label_rename_plan(
    files: Mapping[Path, str], account: str, old: str, new: str
) -> dict[Path, str]:
    """The files renaming one of ``account``'s contribution labels rewrites.

    The label lives in two places: the account's ``labels`` meta, which is what the paycheck form
    offers, and a ``label`` posting-meta on every contribution already logged under it. Rewriting
    only the first would split one line item's history in two.
    """
    after = {}
    for path, text in files.items():
        offered = rewrite.rename_meta_in_scope(text, account, LABELS_META, old, new, listed=True)
        after[path] = rewrite.rename_meta_in_scope(offered, account, LABEL_META, old, new)

    return rewrite.changed_only(files, after)


# --- reopen ---


def reopen_targets(ledger: "Ledger", account: str) -> list[data.Close]:
    """The ``close`` directives that reopening ``account`` deletes.

    Its own, its plug's, and any close a cascade stamped with this account — which is how a rehire
    brings the employer's own deductions back without disturbing one that was closed independently.
    """
    wanted = {account}
    plug = plug_account(account)
    if plug is not None:
        wanted.add(plug)

    out = []
    for e in ledger.entries:
        if not isinstance(e, data.Close):
            continue
        if e.account in wanted or (e.meta or {}).get(CLOSED_WITH_META) == account:
            out.append(e)

    return out


def reopen_plan(
    ledger: "Ledger", files: Mapping[Path, str], account: str
) -> tuple[dict[Path, str], list[str]]:
    """The files a reopen rewrites, and the accounts it brings back.

    Beancount rejects a second ``open`` for an account, so undoing a close means deleting the
    ``close`` directive. It carries no money, so nothing is lost with it.
    """
    closes = reopen_targets(ledger, account)

    by_file: dict[Path, list[int]] = {}
    for e in closes:
        path, lineno = source_of(e)
        by_file.setdefault(path, []).append(lineno)

    after = dict(files)
    for path, linenos in by_file.items():
        after[path] = rewrite.remove_blocks(files[path], linenos)

    return rewrite.changed_only(files, after), sorted(e.account for e in closes)
