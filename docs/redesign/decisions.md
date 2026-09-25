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

### D7 · The editing surface depends on context (2026-09-24)

There is no single editing surface. Where a row is edited depends on the container it sits in and the space around it, compared in [mocks/editing-surfaces.html](mocks/editing-surfaces.html):

- **Inline row** suits a transaction history pane, where rows are wide and edits come in runs. It fails when the row cannot fit every editable field.
- **Side panel** suits a list inside a tighter container, such as a calendar day's entries. It fails when the page has no room to move its content aside for the panel.
- **Modal** is the fallback. It is poor for several edits in a row, because each one means moving the pointer back across the screen to its fields.

### D8 · Rows outside Transactions are edited in place (2026-09-24)

A transaction shown on another page (Accounts, Dashboard, a drill-down) opens its editor where it is, instead of navigating to Transactions. This holds only if it is built generically: one editor that any list can host, with no page-specific wiring. If that cannot be done without hardcoding, revisit this decision.

### D9 · Page state lives in the URL (2026-09-24)

The focus period, filters and the open row live in the URL, so browser back and forward undo and redo each step, including a drill-down.

### D10 · An inline editor grows a More section (2026-09-24)

When a row is edited inline and the form has more than the row can hold (reimbursements, for example), the extra fields sit in a More section that expands under the row. The editor does not hand off to another surface for them.

### D11 · No side panel (2026-09-24)

Supersedes D7's side panel. No place in Yala suits one: the calendar already has its day pane beside it, and on Transactions a panel would cover the context used to verify an entry. Rows are edited inline, growing a More section (D10), or in a modal when the inline row does not fit.

## Open

- **Month from a year.** Moving from a year-level view to a month-level page: which month becomes the focus? Candidates are the previous focus month's calendar month within that year, or the latest month with data in that year.
- **How a host picks its editing surface (D7).** Suggested: one editor measures the list's width with the existing `lib/ui/fit.ts` helpers (`levelThatFits` and the size watch) and picks inline when the row fits, otherwise modal, switching live on resize. No per-page setting and no breakpoint.
- **URL names (D9).** The parameter names and value formats for the focus period, each filter and the open row, fixed once in the app shell spec.
- **Drag-to-arrange boards.** Suggested: keep only on Dashboard.
- **Typical month or budgets.** Suggested: trailing twelve-month median as "typical" now; budgets later if missed.
- **Sankey placement.** Suggested: a toggle on Cash flow's breakdown for the selected period.
- **Phone layout.** Suggested: bottom tab bar with the four main pages and a floating add button.
