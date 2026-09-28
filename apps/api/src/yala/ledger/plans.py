"""Renames and reopens planned as ``{path: new text}`` before anything is written, then applied
atomically by :meth:`yala.sink.FileLedgerSink.rewrite_files`."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
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
    """``None`` if it can. Both paths must be the same kind, and any declared name is refused, so a
    rename can never merge two accounts."""
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
    """An employer's name is also the bare string scoping its deductions and plans, so both are
    rewritten. ``meta`` sets keys on the ``open`` in the same commit."""
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
    """Closed ones included, or the old name would remain in history."""
    meta = ledger.account_meta()

    return sorted(
        a for a in ledger.declared_accounts() if institution_of(meta.get(a)) == institution
    )


def institution_rename_map(ledger: "Ledger", old: str, new: str) -> dict[str, str]:
    """An unmanaged account, or one with no recorded product half, keeps its path; only its metadata
    follows."""
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


def institution_rename_problem(
    ledger: "Ledger", old: str, new: str, colored: Iterable[str] = ()
) -> str | None:
    """Why institution ``old`` cannot be renamed to ``new``, or ``None`` if it can. ``colored``
    names the institutions the user has coloured."""
    if old == new:
        return "the new name matches the current one"

    if not institution_accounts(ledger, old):
        return f"no account is held at {old}"

    if new in institutions.named(ledger.entries, colored):
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
    """The name lives in paths and the ``institution_name`` meta; missing either splits the
    institution in two. Its colour is keyed apart, in the user's settings."""
    renames = institution_rename_map(ledger, old, new)

    after: dict[Path, str] = {}
    for path, text in files.items():
        updated = rewrite.rename_accounts(text, renames)
        after[path] = rewrite.rename_meta_value(updated, INSTITUTION_NAME_META, old, new)

    return rewrite.changed_only(files, after), renames


def label_rename_plan(
    files: Mapping[Path, str], account: str, old: str, new: str
) -> dict[Path, str]:
    """Both the ``labels`` meta and every logged ``label`` posting-meta, or one line item's history
    splits."""
    after = {}
    for path, text in files.items():
        offered = rewrite.rename_meta_in_scope(text, account, LABELS_META, old, new, listed=True)
        after[path] = rewrite.rename_meta_in_scope(offered, account, LABEL_META, old, new)

    return rewrite.changed_only(files, after)


# --- reopen ---


def reopen_targets(ledger: "Ledger", account: str) -> list[data.Close]:
    """Its own, its plug's, and any cascade stamped with it, so a rehire restores only what the
    employer's close took."""
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
    """Beancount rejects a second ``open``, so the ``close`` is deleted; it carries no money."""
    closes = reopen_targets(ledger, account)

    by_file: dict[Path, list[int]] = {}
    for e in closes:
        path, lineno = source_of(e)
        by_file.setdefault(path, []).append(lineno)

    after = dict(files)
    for path, linenos in by_file.items():
        after[path] = rewrite.remove_blocks(files[path], linenos)

    return rewrite.changed_only(files, after), sorted(e.account for e in closes)
