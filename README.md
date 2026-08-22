# Yala

**Y**et **A**nother **L**edger **A**pp — a private, local-first personal-finance backend.
A plain-text **beancount** ledger is the source of truth; this package is the storage/access
layer over it. See `../PROJECT_SPEC.md` for the full design.

Data lives in a **separate private repo** (`yala-private-data`). This repo (`yala`) holds
only code and fake fixtures — never real financial data.

## Monorepo layout

```
apps/
  api/                  backend — Python / FastAPI over the beancount ledger
    src/yala/           package: ledger access, builder, sink (writes), api, schema
    tests/              backend tests (pytest) + fake fixture ledger
    scripts/            tooling (e.g. generate_schema.py)
    pyproject.toml
  web/                  frontend — SvelteKit dashboard (Vitest tests colocated in src/)
packages/
  contract/             shared data contract: data.schema.json + data.example.json
                        (api generates it; web codegens TS types from it)
```

Backend and frontend are peers; their tests never intermix (pytest under `apps/api/tests`,
Vitest under `apps/web/src/**/*.test.ts`). The only thing they share is `packages/contract`.

## Backend (`apps/api`)

```bash
uv venv && source .venv/bin/activate      # venv at repo root
uv pip install -e "apps/api[dev]"
cd apps/api && pytest                      # unit tests over a fake fixture ledger
python scripts/generate_schema.py          # regenerate packages/contract from the models
```

The ledger location is read from the environment (default targets the sibling private repo):

| Var | Default | Meaning |
|---|---|---|
| `YALA_LEDGER_DIR` | `~/personal_dev/yala-project/yala-private-data/ledger` | where the `.beancount` files are read |

Run the local edit API (also serves the built frontend from `apps/web/build`):

```bash
python -m yala.api      # http://127.0.0.1:8000
```

## Frontend (`apps/web`)

```bash
cd apps/web
npm install
npm run gen:types       # regenerate src/lib/types.ts from packages/contract
npm run test            # Vitest
npm run build           # static build -> apps/web/build (served by the API)
```

Data lives in a **separate private repo** (`yala-private-data`) — this repo holds only code
and fake fixtures, never real financial data.
