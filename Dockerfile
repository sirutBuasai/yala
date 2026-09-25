# syntax=docker/dockerfile:1

FROM node:24-alpine AS web
WORKDIR /tmp
COPY apps/web/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/web ./
RUN npm run build

FROM python:3.14-slim
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv
ENV PYTHONUNBUFFERED=1 \
  PYTHONDONTWRITEBYTECODE=1 \
  UV_PROJECT_ENVIRONMENT=/opt/venv \
  UV_COMPILE_BYTECODE=1 \
  PATH=/opt/venv/bin:$PATH \
  PYTHONPATH=/yala-server/api/src \
  YALA_LEDGER_DIR=/data \
  YALA_WEB_DIR=/yala-server/web
WORKDIR /yala-server/api
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-install-project
COPY apps/api/src ./src
COPY --from=web /tmp/build /yala-server/web

ARG REVISION=unknown
LABEL org.opencontainers.image.revision=$REVISION

USER 1000:1000
EXPOSE 8000
HEALTHCHECK --interval=30s \
            --timeout=5s \
            --start-period=20s \
            --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]
CMD ["uvicorn", "yala.api:app", "--host", "0.0.0.0", "--port", "8000"]
