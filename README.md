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

## Backend (`apps/api`)

```bash
uv venv && source .venv/bin/activate      # venv at repo root
uv pip install -e "apps/api[dev]"
cd apps/api
pytest                                     # tests over a fake fixture ledger
python -m yala.builder                     # write build/data.json from the ledger
python -m yala.api                         # local edit API at http://127.0.0.1:8000
```

The ledger location is read from `$YALA_LEDGER_DIR` (default:
`~/personal_dev/yala-project/yala-private-data/ledger`). `python scripts/generate_schema.py`
regenerates `packages/contract` from the pydantic models.

## Frontend (`apps/web`)

```bash
cd apps/web
npm install
npm run gen:types    # regenerate src/lib/types.ts from packages/contract
npm run dev          # dev server
npm run test         # Vitest
npm run build        # static build -> apps/web/build (served by the API)
```

With the API running, the built site gets live data and edit mode. Opened standalone it falls back
to the static `data.json` snapshot (read-only).
