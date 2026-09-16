#!/usr/bin/env python3
"""Regenerate the committed contract from the pydantic models:

schema.py -> packages/contract/data.schema.json -> apps/web/src/lib/data/types.ts
"""

from __future__ import annotations

import re

from _common import ROOT, VENV_PY, WEB, run

TYPES = "src/lib/data/types.ts"

# json2ts footnotes every definition with which schema referenced it, which says nothing
# the declaration around it doesn't. Dropped, so the docstrings written in schema.py are all
# the generated file carries.
_SCHEMA_REF = re.compile(
    r"[ \t]*\*[ \t]*This interface was referenced by.*?\n"
    r"[ \t]*\*[ \t]*via the `definition`[^\n]*\n",
    re.DOTALL,
)
# What that leaves behind: a trailing continuation line, or a comment with nothing else in it.
_TRAILING = re.compile(r"\n[ \t]*\*[ \t]*(?=\n[ \t]*\*/)")
_EMPTY = re.compile(r"[ \t]*/\*\*\n[ \t]*\*/\n")


def _strip_schema_refs(path) -> None:
    text = path.read_text()
    text = _EMPTY.sub("", _TRAILING.sub("", _SCHEMA_REF.sub("", text)))
    path.write_text(text)


def main() -> None:
    print("==> Contract JSON Schema + example (from schema.py)")
    run(VENV_PY, "scripts/gen_contract.py", cwd=ROOT)

    print("==> TypeScript types (from data.schema.json)")
    # json2ts emits space-indented output; prettier reformats it to the repo style (tabs) so the
    # generated file is deterministic and matches what's committed (keeps the freshness gate sane).
    run("npm", "run", "gen:types", cwd=WEB)
    _strip_schema_refs(WEB / TYPES)
    run("npx", "prettier", "--write", TYPES, cwd=WEB)


if __name__ == "__main__":
    main()
