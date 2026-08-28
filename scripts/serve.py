#!/usr/bin/env python3
"""End-product serve: clean -> generate data.json -> build site -> serve.

serve.py web  [--port N] [--worktree DIR]   view-only static site (npm preview; default 4173)
serve.py api  [--port N] [--worktree DIR]   edit mode: FastAPI site + write endpoints (default 8000)

--worktree points the whole pipeline (data.json, built site, and the yala python package) at a
git worktree, so you can serve a feature branch without a full per-worktree install.
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
        help="web = view-only static preview; api = edit mode (FastAPI). Default: web.",
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
    return parser.parse_args(argv)


def _link_if_missing(target: Path, source: Path) -> None:
    """Symlink a build dep (node_modules) from the primary checkout into a worktree so it can
    build without a full per-worktree install. No-op when the target already exists."""
    if target.exists() or target.is_symlink() or not source.exists():
        return
    target.symlink_to(source)
    print(f"==> Linked {target} -> {source}")


def _prepare_worktree(worktree: Path) -> Path:
    """Point the build at a git worktree: link its node_modules from the primary checkout and
    prepend its yala source to PYTHONPATH so the built site, data.json, and API all come from
    the worktree's code (the primary venv still supplies dependencies). Returns the worktree."""
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
    web = root / "apps" / "web"

    print("==> Clean")
    rmtree(web / "build", web / ".svelte-kit", root / "apps" / "api" / "build")

    print("==> Generate data.json -> apps/web/static/data.json")
    run(VENV_PY, "-m", "yala.builder", web / "static" / "data.json", cwd=root)

    print("==> Sync SvelteKit (regenerate .svelte-kit/ removed by clean)")
    run("npx", "svelte-kit", "sync", cwd=web)

    print("==> Build site")
    run("npm", "run", "build", cwd=web)

    if mode == "web":
        print(f"==> Serve view-only (http://localhost:{port})")
        run("npm", "run", "preview", "--", "--port", str(port), cwd=web)
    else:  # api — the only other choice argparse allows
        print(f"==> Serve edit mode (http://127.0.0.1:{port})")
        os.environ["YALA_API_PORT"] = str(port)  # read by yala.api's uvicorn launch
        run(VENV_PY, "-m", "yala.api", cwd=root)


if __name__ == "__main__":
    main(sys.argv[1:])
