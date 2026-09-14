"""FastAPI local edit API backend: the app, its routers, and the static frontend it fronts.

Runs on localhost only — financial data never leaves the machine. Endpoints live in
:mod:`yala.routes`; this module only assembles them.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from yala.builder import build_dict
from yala.routes import ROUTERS
from yala.routes.errors import humanize_error

app = FastAPI(title="Yala")

_WEB_DIR = Path(__file__).resolve().parents[4] / "apps" / "web" / "build"


@app.exception_handler(RequestValidationError)
async def on_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Return a request body/query validation failure as a single clear ``detail`` string (still
    HTTP 422), so the frontend shows one readable sentence, not pydantic's raw error list."""
    messages = dict.fromkeys(humanize_error(e) for e in exc.errors())
    detail = "; ".join(messages) or "invalid request"
    return JSONResponse(status_code=422, content={"detail": detail})


@app.get("/api/data")
def get_data() -> dict:
    return build_dict()


for router in ROUTERS:
    app.include_router(router)


# --- static frontend + entrypoint ---


class SPAStaticFiles(StaticFiles):
    """Serve the SvelteKit static build with client-side-routing awareness.

    The static adapter emits prerendered pages as ``<path>.html``, which plain ``StaticFiles``
    doesn't look for, so a direct URL visit 404s; navigation falls back to that file and then to the
    SPA shell (``200.html``). The ``/api`` namespace is reserved and stays a hard 404 rather than
    being answered with an HTML shell.
    """

    async def get_response(self, path: str, scope: Scope):  # type: ignore[override]
        try:
            return await super().get_response(path, scope)

        except StarletteHTTPException as e:
            # The "api" segment itself is reserved; an api-prefixed page name still routes normally.
            if e.status_code != 404 or path == "api" or path.startswith("api/"):
                raise

            if path not in ("", ".") and not path.endswith(".html"):
                try:
                    return await super().get_response(path + ".html", scope)

                except StarletteHTTPException:
                    pass

            return await super().get_response("200.html", scope)


# Static frontend (the SvelteKit static-adapter build output, at _WEB_DIR) is mounted LAST so
# /api/* routes always win. Absence is tolerated (e.g. before `npm run build` in apps/web/).
if _WEB_DIR.is_dir():
    app.mount("/", SPAStaticFiles(directory=_WEB_DIR, html=True), name="web")


if __name__ == "__main__":
    import os

    import uvicorn

    # Port is overridable (env var, set by scripts/serve.py) so it can dodge a busy 8000.
    port = int(os.environ.get("YALA_API_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
