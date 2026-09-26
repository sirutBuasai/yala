# Handoff

The current state only. Rewrite it at the end of every page; how the work proceeds lives in the README.

- **Done:** app shell, Transactions, Analytics (merged 2026-09-25; the user dogfoods it on real data).
- **Next:** Accounts spec, on its own `redesign/accounts` branch. It replaces Net Worth · Year and All time and Home's balance checklist; sources on `master` are `lib/views/networth/` and `lib/balance/`. Its job and the net worth bridge are sketched in [proposal.md](proposal.md) and the Accounts page of [mocks/prototype.html](mocks/prototype.html).
- **Then:** Dashboard, Planning.
- **Rules the last page settled, which Accounts inherits:** chart clicks (D20), page state across views, pages and reloads (D22, D26, D27, D33, D34), gap years and time frames on year axes (D23, D25, D36), axis labels (D31, D35), KPI shading (D28). Read them in [decisions.md](decisions.md), then [specs/analytics.md](specs/analytics.md) for how they were built.
- **Open questions:** the Open list in [decisions.md](decisions.md).
