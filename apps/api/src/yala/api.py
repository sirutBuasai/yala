"""The local edit API: its routers and the static frontend it fronts. Localhost only, so financial
data never leaves the machine."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from yala import config
from yala.builder import build_dict
from yala.ledger.core import Ledger
from yala.routes import ROUTERS
from yala.routes.errors import humanize_error

app = FastAPI(title="Yala")


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


@app.get("/api/health")
def get_health() -> JSONResponse:
    """503 when a restart could help: a missing site build or a failed load. Ledger errors are only
    counted, since a 503 for them would restart the container forever."""
    if not (config.WEB_DIR / "200.html").is_file():
        return JSONResponse(status_code=503, content={"detail": "site build not found"})
    try:
        led = Ledger(config.MAIN_LEDGER, strict=False).load()
    except Exception:
        return JSONResponse(status_code=503, content={"detail": "ledger failed to load"})
    return JSONResponse(content={"status": "ok", "ledger_errors": len(led.errors)})


for router in ROUTERS:
    app.include_router(router)


class SPAStaticFiles(StaticFiles):
    """Serves prerendered ``<path>.html`` pages, which ``StaticFiles`` misses, then the SPA shell.
    ``/api`` stays a hard 404 rather than an HTML shell."""

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


# Mounted last so /api routes always win. Absence is tolerated so the API runs without a web build.
if config.WEB_DIR.is_dir():
    app.mount("/", SPAStaticFiles(directory=config.WEB_DIR, html=True), name="web")


if __name__ == "__main__":
    import os

    import uvicorn

    # Overridable so serve.py can dodge a busy port.
    port = int(os.environ.get("YALA_API_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
