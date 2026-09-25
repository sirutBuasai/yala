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

### D12 · Each page owns its logging (2026-09-24)

There is no app-wide quick add. A page's own Add offers the entry kinds its context logs: Transactions offers a transaction, a bill pay and a paycheck; Accounts offers a balance.

### D13 · Icon rail when space is short (2026-09-24)

The sidebar never costs a board its designed layout. It shows in full when the page beside it still fits a full-width board, shrinks to an icon rail that expands on hover when only the rail fits, and folds into the hamburger sheet when even the rail would fold the board to one column. Every threshold is measured from the grid's own constants, never a breakpoint.

### D14 · Every board keeps arranging (2026-09-24)

Supersedes the suggestion to arrange only on Dashboard. Arranging exists so the user lays pages out themselves rather than describing a layout to an agent. Each page ships a reasonable default; once the user has arranged it, their stored arrangement (`yala-board-<key>-<version>` in localStorage) becomes the default.

### D15 · Cash flow is named Analytics (2026-09-25)

The page for reading trends across months and years is called Analytics, at `/analytics`. Earlier docs that say Cash flow mean this page.

### D16 · Every edit opens in a modal (2026-09-25)

Supersedes D7, D10 and D11. There is one editing surface: the existing entry modal, wherever a row appears. No inline row editor, no More section, no side panel. D8 stands, since the modal opens over whatever page the row is on.

### D17 · Category by month on Transactions and Analytics (2026-09-25)

The heatmap appears on both pages, drawn from one builder so the numbers cannot disagree. On Transactions it is the running per-category sum while logging; on Analytics it is the year's SUMMARY table, whose cells open the month behind an outlier.

### D18 · The Sankey stays a pane of its own (2026-09-25)

"Where it all went" stays a full-width pane on both Analytics boards, scoped to whatever the board reads. The prototype's "Where it went" category bars are not carried.

### D19 · Analytics ranges are named by their grain (2026-09-25)

The range switch reads Month (a year, month by month; was Activity · Year) and Year (the whole record, year by year; was All time).

### D20 · Bar charts select; only heatmaps navigate (2026-09-25)

Clicking a period in a bar chart narrows the page's other panes to that period in place: KPI cards (a month against its average), the Sankey, and a mark on every chart sharing that axis. Clicking it again widens the page back. A heatmap is the one chart whose click leaves the page, for the rows behind a cell on Transactions. This is the rule for clickable charts on every page.

### D21 · A page reopens as you left it (2026-09-25)

Supersedes the app shell's rule that a sidebar link carries only the focus month. What you pick on a chart persists across pages: a sidebar link reopens its page with the URL state it was last left with in this tab (picks, filters, range), moved to the current focus month. It is kept in session storage, so it survives a reload but not a new tab. State that belongs to another month, such as a chosen calendar day, is dropped by the page that reads it.

### D22 · A page also reopens at its scroll (2026-09-25)

Extends D21. A sidebar link returns to where the page was scrolled when you left it, once its board is tall enough to hold that position. Back and forward keep the router's own restore; a drill-in opens its page at the top.

### D23 · Year axes keep gap years (2026-09-25)

A year with nothing logged keeps its place on every year axis, so the record reads as continuous. How far back the Year view reaches is open: see [mocks/analytics-year-ranges.html](mocks/analytics-year-ranges.html).

### D24 · Carets and I-beams only where you type (2026-09-25)

The text caret and the I-beam pointer appear only in fields that take typing. A click on a chart or control never places a caret or starts a text selection.

### D25 · Year view time frame: preset spans (2026-09-25)

Style A of [mocks/analytics-year-ranges.html](mocks/analytics-year-ranges.html). The Year view's header offers 5Y, 10Y, 20Y, 50Y and All, each ending at the latest year, default 10Y, in the URL as `span`. The window scopes the whole board: KPI cards, stat matrix, Sankey and every year axis. A picked year the window moves past is dropped. A window reaching back past the first tracked year is the lifetime, and reads as one.

### D26 · A reload starts the view over (2026-09-25)

Amends D21 and D22. Reloading returns the page to its defaults (latest month, no picks, no filters, the top of the page) and forgets where every other page was left, so the sidebar opens them fresh too. Preferences in local storage, such as board arrangements and the theme, are kept. A link opened in a new tab still opens exactly what it names.

## Open

- **A card filter's figure.** When the history is filtered to one card, show "Charged to card" (full bills) beside Spent, so the gap reads as what was fronted? Or nothing. "Charged − paid" was rejected: it mostly reflects statement timing.
- **The open entry in the URL (D9).** The modal's open entry is not in the URL yet, so back does not close it.
- **KPI shading in light mode.** Deeper hues or stronger pastels. Mock: [mocks/kpi-underlay-strength.html](mocks/kpi-underlay-strength.html).
- **Phone layout.** Suggested: bottom tab bar with the four main pages.

## Resolved elsewhere

- **Month from a year:** same calendar month in the new year, clamped to tracked months (specs/app-shell.md).
- **URL names:** `month` (shared), and on Transactions `day`, `type`, `category`, `account`, `q` (the specs).
- **Typical month or budgets:** "average" is the mean of up to twelve prior months with data (`vsAverage`, `categoryDeviation`); no budgets.
