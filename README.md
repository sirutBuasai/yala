# Yala

**Y**et **A**nother **L**edger **A**pp — a private, local-first personal-finance dashboard over a
plain-text [beancount](https://beancount.github.io/) ledger. The ledger is the source of truth;
this repo is the read / write / visualize layer.

Real financial data lives in a **separate private repo** (`yala-private-data`). This repo holds
only code and fake fixtures — never real data.

## Layout

- `apps/api` — Python / FastAPI backend: ledger access, the `data.json` builder, and the write sink.
- `apps/web` — SvelteKit dashboard (static build; hand-rolled SVG charts).
- `packages/contract` — the shared `data.json` schema. The API generates it; the web codegens its
  TypeScript types from it, so the contract can't silently drift.

## Requirements

- Python ≥ 3.10 and [`uv`](https://docs.astral.sh/uv/)
- Node ≥ 20 and npm

## Workflows (`make`)

The `Makefile` is the single entrypoint; the actual recipes live in `scripts/`.

```bash
make bootstrap   # install backend + frontend deps (first run)
make gen         # regenerate the contract: data.schema.json + types.ts
make serve       # clean → generate data.json → build → serve view-only site (localhost:4173)
make serve-api   # clean → generate data.json → build → serve site + edit API (127.0.0.1:8000)
make test        # backend + frontend test suites
make test-api    # backend only (pytest)
make test-web    # frontend only (vitest)
make clean       # remove build artifacts
```
