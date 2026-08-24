#!/usr/bin/env python3
"""End-product serve: clean -> generate data.json -> build site -> serve.

serve.py web  [--port N]   view-only static site (npm preview; default port 4173)
serve.py api  [--port N]   edit mode: FastAPI serves the built site + write endpoints (default 8000)
"""

from __future__ import annotations

import argparse
import os
import sys

from _common import ROOT, VENV_PY, WEB, rmtree, run

DEFAULT_PORTS = {"web": 4173, "api": 8000}


def _port(value: str) -> int:
    """A valid TCP port (1-65535). Rejects junk up front so we never hand a bad port to
    uvicorn / vite."""
    try:
        port = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"port must be an integer, got {value!r}")

    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError(f"port must be in 1-65535, got {port}")

    return port


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="serve.py",
        description="Clean, generate data.json, build the site, then serve it.",
    )
    parser.add_argument(
        "mode",
        nargs="?",
        default="web",
        choices=("web", "api"),
        help="web = view-only static preview; api = edit mode (FastAPI). Default: web.",
    )
    parser.add_argument(
        "--port",
        type=_port,
        default=None,
        help="Port to serve on (default: 4173 for web, 8000 for api).",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> None:
    args = _parse_args(argv)
    mode = args.mode
    port = args.port if args.port is not None else DEFAULT_PORTS[mode]

    print("==> Clean")
    rmtree(WEB / "build", WEB / ".svelte-kit", ROOT / "apps" / "api" / "build")

    print("==> Generate data.json -> apps/web/static/data.json")
    run(VENV_PY, "-m", "yala.builder", "apps/web/static/data.json", cwd=ROOT)

    print("==> Sync SvelteKit (regenerate .svelte-kit/ removed by clean)")
    run("npx", "svelte-kit", "sync", cwd=WEB)

    print("==> Build site")
    run("npm", "run", "build", cwd=WEB)

    if mode == "web":
        print(f"==> Serve view-only (http://localhost:{port})")
        run("npm", "run", "preview", "--", "--port", str(port), cwd=WEB)
    else:  # api — the only other choice argparse allows
        print(f"==> Serve edit mode (http://127.0.0.1:{port})")
        os.environ["YALA_API_PORT"] = str(port)  # read by yala.api's uvicorn launch
        run(VENV_PY, "-m", "yala.api", cwd=ROOT)


if __name__ == "__main__":
    main(sys.argv[1:])
