#!/usr/bin/env python3
"""Regenerate the committed contract from the pydantic models:

schema.py -> packages/contract/data.schema.json -> apps/web/src/lib/data/types.ts
"""

from __future__ import annotations

from _common import ROOT, VENV_PY, WEB, run


def main() -> None:
    print("==> Contract JSON Schema + example (from schema.py)")
    run(VENV_PY, "scripts/gen_contract.py", cwd=ROOT)

    print("==> TypeScript types (from data.schema.json)")
    # json2ts emits space-indented output; prettier reformats it to the repo style (tabs) so the
    # generated file is deterministic and matches what's committed (keeps the freshness gate sane).
    run("npm", "run", "gen:types", cwd=WEB)
    run("npx", "prettier", "--write", "src/lib/data/types.ts", cwd=WEB)


if __name__ == "__main__":
    main()
