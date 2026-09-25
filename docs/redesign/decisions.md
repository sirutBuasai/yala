# Decisions

Newest last. A settled decision changes only with the user's agreement; record the change as a new entry rather than editing the old one.

## Settled

### D1 · Page structure (2026-09-24)

Dashboard, Transactions, Cash flow, Accounts, Planning and Manage, reached from a left sidebar. See [proposal.md](proposal.md).

### D2 · Pace: one page at a time, dogfooded (2026-09-24)

Each page is specified (job, owned figures, click map), built, dogfooded on real data and revised before the next page starts. What is clickable and where it routes is designed deliberately, never left to whatever the prototype did.

### D3 · One owner per figure (2026-09-24)

Each figure has one owning page. Elsewhere it appears at most as a headline that links to the owner. Data is not duplicated where it is unnecessary. The prototype repeats several figures, and each page's spec must resolve its share:

- Month income, spent and saved: Dashboard card, Transactions rail, Cash flow stats row, Cash flow table footer.
- Category against typical: Transactions rail, Cash flow table, Dashboard attention list.
- Balance status: Transactions rail, Dashboard attention list, Accounts.
- Net worth bridge: Dashboard and Accounts.
- Recent transactions: Dashboard and Transactions.

### D4 · The focus period carries across pages (2026-09-24)

The focus month carries over when moving between pages. When a page works at year granularity, the focus year carries over instead.

### D5 · Branching (2026-09-24)

`redesign/main` is the integration branch and home of these docs. Pages and features branch off it and merge back; it merges to `master` when the redesign is complete. See [README.md](README.md).

### D6 · Current charts and copy carry over (2026-09-24)

The existing charts, figures, titles, subtitles, captions and UI strings carry over as they are. Mocks and specs show the current chart by default. A proposed improvement is shown as its own mock next to the current one, for the user to choose. The prototype restyled charts freely; some of its versions were better and some worse, so it is not a reference for chart design.

## Open

- **Month from a year.** Moving from a year-level view to a month-level page: which month becomes the focus? Candidates are the previous focus month's calendar month within that year, or the latest month with data in that year.
- **Filters in the URL.** Whether every filter and the focus period live in the URL, so back undoes a drill-down and a view can be bookmarked. Also in [mocks/editing-surfaces.html](mocks/editing-surfaces.html).
- **Where a transaction is edited.** A side panel over the current page, a modal, or inline in the row; and whether rows shown on other pages open the same editor in place or navigate to Transactions. Compare them in [mocks/editing-surfaces.html](mocks/editing-surfaces.html).
- **Drag-to-arrange boards.** Suggested: keep only on Dashboard.
- **Typical month or budgets.** Suggested: trailing twelve-month median as "typical" now; budgets later if missed.
- **Sankey placement.** Suggested: a toggle on Cash flow's breakdown for the selected period.
- **Phone layout.** Suggested: bottom tab bar with the four main pages and a floating add button.
