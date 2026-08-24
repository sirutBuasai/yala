#!/usr/bin/env python3
"""End-product serve: clean -> generate data.json -> build site -> serve.

serve.py web   view-only static site (npm preview)
serve.py api   edit mode: FastAPI serves the built site + write endpoints
"""

from __future__ import annotations

import sys

from _common import ROOT, VENV_PY, WEB, rmtree, run


def main(argv: list[str]) -> None:
    mode = argv[0] if argv else "web"

    print("==> Clean")
    rmtree(WEB / "build", WEB / ".svelte-kit", ROOT / "apps" / "api" / "build")

    print("==> Generate data.json -> apps/web/static/data.json")
    run(VENV_PY, "-m", "yala.builder", "apps/web/static/data.json", cwd=ROOT)

    print("==> Sync SvelteKit (regenerate .svelte-kit/ removed by clean)")
    run("npx", "svelte-kit", "sync", cwd=WEB)

    print("==> Build site")
    run("npm", "run", "build", cwd=WEB)

    if mode == "web":
        print("==> Serve view-only (http://localhost:4173)")
        run("npm", "run", "preview", cwd=WEB)
    elif mode == "api":
        print("==> Serve edit mode (http://127.0.0.1:8000)")
        run(VENV_PY, "-m", "yala.api", cwd=ROOT)
    else:
        print(f"unknown serve mode: '{mode}' (use 'web' or 'api')", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
