# Yala

**Y**et **A**nother **L**edger **A**pp — a private, local-first personal-finance backend.
A plain-text **beancount** ledger is the source of truth; this package is the storage/access
layer over it. See `../PROJECT_SPEC.md` for the full design.

Data lives in a **separate private repo** (`yala-private-data`). This repo (`yala`) holds
only code and fake fixtures — never real financial data.

## Setup

```bash
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
```

The ledger location is read from the environment (default targets the sibling repo):

| Var | Default | Meaning |
|---|---|---|
| `YALA_LEDGER_DIR` | `~/personal_dev/yala-project/yala-private-data/ledger` | where the `.beancount` files are read |

## Usage

Currently a library — read the ledger via `yala.store.Ledger`:

```python
from yala.store import Ledger
led = Ledger().load()
led.category_totals(2025, 8)   # {'Housing': Decimal('1685.42'), ...}
```

```bash
pytest    # unit tests over a fake fixture ledger
```

## Layout

```
src/yala/
  config.py   ledger location (env-resolved); ledger owns currency/accounts/categories
  store.py    Ledger: load + query transactions and category totals
tests/        unit tests + fake fixture ledger
```

(No CLI yet — a `yala` command will return when there are operational tasks to run,
e.g. building the dashboard data or importing statements.)

The initial spreadsheet → beancount migration was a completed one-off; the migrated ledger
lives in `yala-private-data/` and the original workbooks are archived under `../ledger/`.

Not yet in scope: income/paychecks, net worth, investments, cards.
