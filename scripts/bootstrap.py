#!/usr/bin/env python3
"""One-shot dev setup: Python backend venv + deps, then frontend deps."""

from __future__ import annotations

from _common import ROOT, WEB, run


def main() -> None:
    print("==> Backend (uv venv + editable install)")
    run("uv", "venv", "--allow-existing", cwd=ROOT)
    run("uv", "pip", "install", "-e", "apps/api[dev]", cwd=ROOT)

    print("==> Frontend (npm install)")
    run("npm", "install", cwd=WEB)

    print("==> Done. Next: make gen && make serve")


if __name__ == "__main__":
    main()
