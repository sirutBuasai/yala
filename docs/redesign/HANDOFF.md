# Handoff

The current state only. Rewrite it at the end of every page; how the work proceeds lives in the README.

- **Done:** app shell, Transactions, Analytics, Accounts, Dashboard (Dashboard merged 2026-09-26; the user dogfoods every page on real data). Every board's default is now the user's own stored arrangement (D51).
- **Next:** Planning spec, on its own `redesign/planning` branch. `/planning` is still a placeholder. On `master`, Planning lived inside Net Worth · All time: Financial progress with its Adjust button and planning panel, Projected investments, and Years of freedom (`lib/views/networth/AllTimeView.svelte`, `Planning.svelte`, `copy.ts`). Accounts gave up the first and last to it (see [specs/accounts.md](specs/accounts.md)), and Dashboard headlines Financial progress with a title that opens `/planning` (D44, D48). The `planning` and `slider` e2e suites wait for it.
- **Waiting on the user:** D47's remaining figures (lists, Spending by category, the donut legend, Log balances' totals, the calendar), which need a choice of what gives way when a figure widens its own column; whether a Recent transactions row should keep opening its month.
- **Rules to inherit:** read every Settled entry in [decisions.md](decisions.md), newest last; a heading marks what is superseded. D38 to D51 changed shared pieces (split cards, line picks, pane floors, figure readings, title links, Edit parity). Then [specs/dashboard.md](specs/dashboard.md) and [specs/accounts.md](specs/accounts.md), and the README's building notes.
- **Open questions:** the Open list in [decisions.md](decisions.md).
