"""Plans whole-ledger text rewrites for renames. Matching is boundary-aware: a sibling sharing a
prefix is untouched, while descendants move with the account."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from decimal import Decimal
from pathlib import Path

from yala.ledger import directives

#: Characters that continue an account path. A match preceded by one of these is part of a longer
#: name; a match followed by one (other than ``:``) is a sibling, not this account.
_PATH_CHARS = "A-Za-z0-9:_-"
_TAIL_CHARS = "A-Za-z0-9_-"

#: An indented posting line, which is what scopes a posting-level ``label`` to its account. Meta
#: lines can't be mistaken for one: beancount requires a meta key to start lowercase.
_POSTING_RE = re.compile(r"^\s+(?P<account>[A-Z][A-Za-z0-9:-]*)(?:\s|$)")

#: A dated directive naming an account, which scopes the metadata beneath it. A transaction header's
#: leading quote keeps it from matching.
_DIRECTIVE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\s+\S+\s+(?P<account>[A-Z][A-Za-z0-9:-]*)")


def ledger_files(ledger_dir: Path) -> dict[Path, str]:
    """The whole directory, not just loaded files: a detached file still names accounts."""
    return {path: path.read_text() for path in sorted(Path(ledger_dir).glob("**/*.beancount"))}


def _account_pattern(accounts: Iterable[str]) -> re.Pattern[str]:
    """One pattern matching any of ``accounts`` as a whole path, longest first so a parent can't win
    over the child that contains it."""
    alternatives = "|".join(re.escape(a) for a in sorted(accounts, key=len, reverse=True))
    return re.compile(rf"(?<![{_PATH_CHARS}])(?:{alternatives})(?![{_TAIL_CHARS}])")


def rename_accounts(text: str, renames: Mapping[str, str]) -> str:
    """One pass, so a new name is never re-matched as an old one when renames chain."""
    if not renames:
        return text

    pattern = _account_pattern(renames)
    return pattern.sub(lambda m: renames[m.group(0)], text)


def _quoted_value_pattern(key: str) -> re.Pattern[str]:
    """A ``key: "value"`` metadata line, capturing the value."""
    return re.compile(rf'^(?P<head>\s*{re.escape(key)}:\s*")(?P<value>[^"]*)(?P<tail>".*)$', re.M)


def rename_meta_value(text: str, key: str, old: str, new: str) -> str:
    """For a name duplicated as a bare string, where renaming only the path silently unlinks
    them."""

    def swap(m: re.Match[str]) -> str:
        return m["head"] + new + m["tail"] if m["value"] == old else m.group(0)

    return _quoted_value_pattern(key).sub(swap, text)


def rename_custom_value(text: str, custom_type: str, old: str, new: str) -> str:
    """A ``custom`` keys its subject positionally, so skipping it strands the directive on a dead
    name."""
    pattern = re.compile(
        rf'^(?P<head>\d{{4}}-\d{{2}}-\d{{2}}\s+custom\s+"{re.escape(custom_type)}"\s+")'
        r'(?P<value>[^"]*)(?P<tail>".*)$',
        re.M,
    )

    def swap(m: re.Match[str]) -> str:
        return m["head"] + new + m["tail"] if m["value"] == old else m.group(0)

    return pattern.sub(swap, text)


def rename_meta_in_scope(
    text: str, account: str, key: str, old: str, new: str, *, listed: bool = False
) -> str:
    """Scoped by owner, since one word may label a line item at another account. ``listed`` rewrites
    one item of a comma-joined value."""
    value_re = _quoted_value_pattern(key)
    out: list[str] = []
    scope: str | None = None

    def swap(value: str) -> str | None:
        """The rewritten value, or ``None`` when this one isn't the target."""
        if not listed:
            return new if value == old else None

        items = [s.strip() for s in value.split(",")]
        if old not in items:
            return None
        return ",".join(new if item == old else item for item in items)

    for line in text.splitlines(keepends=True):
        owner = _POSTING_RE.match(line) if line[:1].isspace() else _DIRECTIVE_RE.match(line)

        if owner is not None:
            scope = owner["account"]

        elif not line[:1].isspace():
            scope = None  # an entry that names no account ends the previous scope

        elif scope == account:
            m = value_re.match(line.rstrip("\n"))
            replacement = swap(m["value"]) if m is not None else None
            if m is not None and replacement is not None:
                line = m["head"] + replacement + m["tail"] + line[len(line.rstrip("\n")) :]

        out.append(line)

    return "".join(out)


# "<date> balance <account>" then the right-aligned number and its currency; none of the three
# leading tokens can contain a space, so they split cleanly.
_BALANCE_LINE_RE = re.compile(r"^(?P<head>\S+ \S+ \S+)(?P<gap> +)(?P<num>[\d,.-]+)(?P<tail> .*)$")


def reamount(line: str, amount: Decimal) -> str:
    """Swap the amount on a ``balance`` line, holding the number's right edge so the file keeps its
    aligned column."""
    m = _BALANCE_LINE_RE.match(line.rstrip("\n"))
    if m is None:
        raise ValueError(f"unparsable balance line: {line!r}")

    num = f"{amount:,.2f}"
    end = len(m["head"]) + len(m["gap"]) + len(m["num"])
    gap = max(end - len(m["head"]) - len(num), 1)
    return f"{m['head']}{' ' * gap}{num}{m['tail']}\n"


def block_end(lines: list[str], begin: int) -> int:
    """Index one past the directive starting at ``begin``; a blank or unindented line ends it."""
    end = begin + 1
    while end < len(lines) and lines[end].startswith((" ", "\t")) and lines[end].strip():
        end += 1
    return end


def set_meta_block(text: str, lineno: int, values: Mapping[str, str | None]) -> str:
    """Only the named keys change, ``None`` removing one. The directive's own line is never
    rewritten."""
    if not values:
        return text

    lines = text.splitlines(keepends=True)
    begin = lineno - 1
    end = block_end(lines, begin)

    touched = re.compile(rf"^\s*(?:{'|'.join(re.escape(key) for key in values)})\s*:")
    block = [lines[begin]] + [line for line in lines[begin + 1 : end] if not touched.match(line)]
    block += [
        f"{directives.meta_line(key, value)}\n"
        for key, value in values.items()
        if value is not None
    ]

    return "".join(lines[:begin] + block + lines[end:])


def remove_blocks(text: str, linenos: Iterable[int]) -> str:
    """Removed bottom-up, so earlier line numbers stay valid."""
    lines = text.splitlines(keepends=True)

    for lineno in sorted(linenos, reverse=True):
        begin = lineno - 1
        del lines[begin : block_end(lines, begin)]

    return "".join(lines)


def changed_only(before: Mapping[Path, str], after: Mapping[Path, str]) -> dict[Path, str]:
    """The files ``after`` actually differs on, so an untouched file is never rewritten."""
    return {path: text for path, text in after.items() if before[path] != text}
