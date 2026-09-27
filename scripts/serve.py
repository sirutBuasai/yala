#!/usr/bin/env python3
"""Clean, generate data.json, build the site, and serve it.

serve.py web  [--port N] [--worktree DIR] [--ledger DIR] [--dev]   the snapshot alone (port 4173)
serve.py api  [--port N] [--worktree DIR] [--ledger DIR] [--dev]   snapshot + write API (port 8000)

--worktree builds and serves a git worktree's code; --ledger points data.json and the API at another
ledger directory, such as a throwaway worktree; --dev builds in the development pages.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

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
        help="web = the snapshot alone; api = snapshot + the write API (FastAPI). Default: web.",
    )
    parser.add_argument(
        "--port",
        type=_port,
        default=None,
        help="Port to serve on (default: 4173 for web, 8000 for api).",
    )
    parser.add_argument(
        "--worktree",
        type=str,
        default=None,
        help="Serve a git worktree's build, data.json, and yala package instead of this checkout.",
    )
    parser.add_argument(
        "--ledger",
        type=str,
        default=None,
        help="Ledger directory to read and write instead of $YALA_LEDGER_DIR or the default.",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Build in the development pages (the token gallery at /dev).",
    )
    return parser.parse_args(argv)


def _link_if_missing(target: Path, source: Path) -> None:
    """Symlink a build dep (node_modules) from the primary checkout into a worktree so it can
    build without a full per-worktree install. No-op when the target already exists."""
    if target.exists() or target.is_symlink() or not source.exists():
        return
    target.symlink_to(source)
    print(f"==> Linked {target} -> {source}")


def _prepare_worktree(worktree: Path) -> Path:
    """Links node_modules from the primary checkout and puts the worktree's source on PYTHONPATH;
    the primary venv still supplies dependencies."""
    worktree = worktree.resolve()
    if not (worktree / "apps" / "web").is_dir():
        sys.exit(f"not a yala worktree (no apps/web under {worktree})")
    _link_if_missing(worktree / "node_modules", ROOT / "node_modules")
    _link_if_missing(worktree / "apps" / "web" / "node_modules", WEB / "node_modules")
    api_src = str(worktree / "apps" / "api" / "src")
    existing = os.environ.get("PYTHONPATH", "")
    os.environ["PYTHONPATH"] = api_src + (os.pathsep + existing if existing else "")
    print(f"==> Worktree {worktree}\n==> PYTHONPATH={os.environ['PYTHONPATH']}")
    return worktree


def main(argv: list[str]) -> None:
    args = _parse_args(argv)
    mode = args.mode
    port = args.port if args.port is not None else DEFAULT_PORTS[mode]

    root = _prepare_worktree(Path(args.worktree)) if args.worktree else ROOT
    if args.ledger:
        ledger = Path(args.ledger).resolve()
        if not (ledger / "main.beancount").is_file():
            sys.exit(f"not a ledger directory (no main.beancount under {ledger})")
        os.environ["YALA_LEDGER_DIR"] = str(ledger)
        print(f"==> Ledger {ledger}")
    web = root / "apps" / "web"

    print("==> Clean")
    rmtree(web / "build", web / ".svelte-kit", root / "apps" / "api" / "build")

    print("==> Generate data.json -> apps/web/static/data.json")
    run(VENV_PY, "-m", "yala.builder", web / "static" / "data.json", cwd=root)

    print("==> Sync SvelteKit (regenerate .svelte-kit/ removed by clean)")
    run("npx", "svelte-kit", "sync", cwd=web)

    if args.dev:
        os.environ["VITE_YALA_DEV"] = "1"  # read by $lib/nav/devtools at build time
    print(f"==> Build site{' with development pages' if args.dev else ''}")
    run("npm", "run", "build", cwd=web)

    if mode == "web":
        print(f"==> Serve the snapshot alone, no write API (http://localhost:{port})")
        run("npm", "run", "preview", "--", "--port", str(port), cwd=web)
    else:  # api — the only other choice argparse allows
        print(f"==> Serve with the write API (http://127.0.0.1:{port})")
        os.environ["YALA_API_PORT"] = str(port)  # read by yala.api's uvicorn launch
        run(VENV_PY, "-m", "yala.api", cwd=root)


if __name__ == "__main__":
    main(sys.argv[1:])
