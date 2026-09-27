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

### D4 · The focus period carries across pages (2026-09-24) · superseded by D33

The focus month carries over when moving between pages. When a page works at year granularity, the focus year carries over instead.

### D5 · Branching (2026-09-24)

`redesign/main` is the integration branch and home of these docs. Pages and features branch off it and merge back; it merges to `master` when the redesign is complete. See [README.md](README.md).

### D6 · Current charts and copy carry over (2026-09-24)

The existing charts, figures, titles, subtitles, captions and UI strings carry over as they are. Mocks and specs show the current chart by default. A proposed improvement is shown as its own mock next to the current one, for the user to choose. The prototype restyled charts freely; some of its versions were better and some worse, so it is not a reference for chart design.

### D7 · The editing surface depends on context (2026-09-24) · superseded by D16

There is no single editing surface. Where a row is edited depends on the container it sits in and the space around it, compared in [mocks/editing-surfaces.html](mocks/editing-surfaces.html):

- **Inline row** suits a transaction history pane, where rows are wide and edits come in runs. It fails when the row cannot fit every editable field.
- **Side panel** suits a list inside a tighter container, such as a calendar day's entries. It fails when the page has no room to move its content aside for the panel.
- **Modal** is the fallback. It is poor for several edits in a row, because each one means moving the pointer back across the screen to its fields.

### D8 · Rows outside Transactions are edited in place (2026-09-24)

A transaction shown on another page (Accounts, Dashboard, a drill-down) opens its editor where it is, instead of navigating to Transactions. This holds only if it is built generically: one editor that any list can host, with no page-specific wiring. If that cannot be done without hardcoding, revisit this decision.

### D9 · Page state lives in the URL (2026-09-24)

The focus period, filters and the open row live in the URL, so browser back and forward undo and redo each step, including a drill-down.

### D10 · An inline editor grows a More section (2026-09-24) · superseded by D16

When a row is edited inline and the form has more than the row can hold (reimbursements, for example), the extra fields sit in a More section that expands under the row. The editor does not hand off to another surface for them.

### D11 · No side panel (2026-09-24) · superseded by D16

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

### D21 · A page reopens as you left it (2026-09-25) · superseded by D33

Supersedes the app shell's rule that a sidebar link carries only the focus month. What you pick on a chart persists across pages: a sidebar link reopens its page with the URL state it was last left with in this tab (picks, filters, range), moved to the current focus month. It is kept in session storage, so it survives a reload but not a new tab. State that belongs to another month, such as a chosen calendar day, is dropped by the page that reads it.

### D22 · A page also reopens at its scroll (2026-09-25) · amended by D33, D34

Extends D21. A sidebar link returns to where the page was scrolled when you left it, once its board is tall enough to hold that position. Back and forward keep the router's own restore; a drill-in opens its page at the top.

### D23 · Year axes keep gap years (2026-09-25)

A year with nothing logged keeps its place on every year axis, so the record reads as continuous. How far back the Year view reaches is open: see [mocks/analytics-year-ranges.html](mocks/analytics-year-ranges.html).

### D24 · Carets and I-beams only where you type (2026-09-25)

The text caret and the I-beam pointer appear only in fields that take typing. A click on a chart or control never places a caret or starts a text selection.

### D25 · Year view time frame: preset spans (2026-09-25) · amended by D36

Style A of [mocks/analytics-year-ranges.html](mocks/analytics-year-ranges.html). The Year view's header offers 5Y, 10Y, 20Y, 50Y and All, each ending at the latest year, default 10Y, in the URL as `span`. The window scopes the whole board: KPI cards, stat matrix, Sankey and every year axis. A picked year the window moves past is dropped. A window reaching back past the first tracked year is the lifetime, and reads as one.

### D26 · A reload starts the view over (2026-09-25) · amended by D27

Amends D21 and D22. Reloading returns the page to its defaults (latest month, no picks, no filters, the top of the page) and forgets where every other page was left, so the sidebar opens them fresh too. Preferences in local storage, such as board arrangements and the theme, are kept. A link opened in a new tab still opens exactly what it names.

### D27 · A view is a path; a pick is a query parameter (2026-09-25)

Amends D26. Where you are and what you picked are told apart by where they sit in the URL, not by a list of names:

- **Path, kept on reload:** the page and its view, such as `/analytics/year`. A page's views are paths under it, matched by a param matcher in `src/params`.
- **Query, dropped on reload:** everything picked or filtered, such as `month`, `scope`, `span`, `category`, `q`.

A reload keeps the path and drops the query, on the current page and on every page the sidebar would reopen. A new setting chooses its behaviour by choosing where it lives.

### D28 · KPI shading takes deeper hues in light mode (2026-09-25)

Chosen from [mocks/kpi-underlay-strength.html](mocks/kpi-underlay-strength.html). In light mode a KPI's wash and hairline take their hue at one OKLCH lightness (0.52) before mixing, with the wash at 11%, so every hue shades about equally, survives a warm-shifted display, and the badge over it keeps AA. Dark mode is unchanged.

### D29 · Every wash takes the deep hue in light mode (2026-09-25)

Extends D28 across the app. In light mode every accent wash behind a control, a badge or a row (a selected pill, a chosen option, the current page, a hovered row, a pending day, a modal's tinted header) takes its hue at D28's lightness and carries a smaller share of it, so a selected pill lands on the KPI wash beside it. Hairlines, rings and chart marks are unchanged, and so is dark mode.

### D30 · The URL is for back and forward, not for reopening (2026-09-25) · superseded by D33

Supersedes D21's picks. A sidebar link opens its page at the view it was left on, with the focus month (D4) and no picks; so does the Month and Year switch. Picks stay in the URL, so back and forward still undo each step (D9). What each view keeps is its scroll (D22), now per view: switching back returns to where that view was left. A drill-in's own state, such as the account Where the money sits opened, never follows you to another page.

### D31 · Every axis label is drawn (2026-09-25) · amended by D35

No x-label is dropped to make room. Labels lie flat where they fit and turn 45 degrees, or upright, where they would overlap, and the chart gives up the height they need. Bar, line and stacked area charts share one layout (`xLabelLayout`, `XLabels`).

### D32 · Bar lists pick one way (2026-09-25)

A bar list whose rows choose something (Spending by category, Where the money sits) uses one row, `PickRow`: a wash behind the row on hover and while chosen, never a layer over its bars, so their colour holds.

### D33 · Each view keeps its own state (2026-09-25)

Supersedes D4, D21's carrying of the focus month and D30. Every view (every path, such as `/analytics` and `/analytics/year`) keeps its own URL state in this tab: its month, picks, filters and span, and its scroll. Moving between views or pages, by the sidebar or the Month and Year switch, returns each to how it was left; a view never visited opens at its defaults. Nothing carries from one view to another, so picking 2025 on Year leaves Month on whatever month it was showing. The URL still makes back and forward undo each step (D9). A reload keeps the view and drops every view's remembered state (D26, D27). Built in `lib/nav/left.ts`.

### D34 · A drill-in lands on its pane (2026-09-25)

Amends D22. Every click that opens another page opens it at the pane it acts on, not at the page's top: a Category by month cell opens Transaction history, and Where the money sits opens Log balances at the account. The pane, and anything to focus in it, ride in history state rather than the URL (`lib/nav/drill.ts`), so no view remembers them (D33).

### D35 · A crowded date axis names its years (2026-09-25)

Amends D31. Axis labels are placed by one module (`xAxisLabels` in `lib/charts/axis.ts`, drawn by `XLabels`): flat where every label fits; on a crowded axis whose points span several years, each year named once, flat and centred on its points, whose own names stay in the hover; otherwise every label turned 45 degrees, or upright. A year whose label would run past either end of the plot is left unlabelled. A picked year's label then sits in the middle of its marked range.

### D36 · Year spans are 3Y, 5Y, 10Y and All (2026-09-25)

Amends D25: the industry-standard set replaces 5Y, 10Y, 20Y, 50Y and All. 10Y stays the default.

### D37 · Rows run oldest first (2026-09-25)

Every snapshot table and heatmap lists its periods oldest at the top, as the category heatmaps do; Yearly snapshots no longer opens on the latest year.

### D38 · A split card reads a total by its parts (2026-09-25)

A stat card may draw each total as one bar split into its parts, each keyed with its share, as the Accounts pane of the prototype did (`SplitPane`, `SplitBar`). A key that would overflow its line names the largest parts and rolls the rest into `Other`, so widening the pane names more. It replaces the Net worth and Savings rate KPIs on Accounts · Month and every KPI on Dashboard. Snapshots carry what each liability owes (`owed`), so the Liabilities bar splits by account for any period.

### D39 · Line and area charts select too (2026-09-25)

Extends D20. A click on a line or stacked area picks a period as a bar does, and again widens back. The hover still reads each point; the click, and its shaded band, cover every point in the period the view picks at (`pickBy`): a month on Accounts · Month, a year on Accounts · Year and Analytics · Year, whose snapshot lines plot months. The bands tile the plot and reach under the axis labels (`PickBands`, `pickGroups`). KPI underlays are not clickable.

### D40 · Spending pace opens its day (2026-09-25)

An exception to D20: a day on Dashboard's Spending pace opens that day in Transactions' calendar (D34), since a day is not a period any page picks.

### D41 · A pane has one floor (2026-09-26) · amended by D43

A pane resizes freely down to one fixed floor and is refused only below it. The floor is measured once when a resize starts (the narrowest width the content fits at any height, then the height it needs at that width), so it never depends on the pane's current shape: a pane made short and wide narrows back to the same floor. A merged KPI card's sections never go below their own floors (`minmax(min-content, …)` tracks), so its floor is theirs added up, as the cards it was merged from, and a split gives each half at least its floor.

### D42 · Dashboard's cards open their owners (2026-09-26)

Cash flow opens Analytics · Month narrowed to the month; Net worth opens Accounts at its card; a Spending pace day opens Transactions' calendar (D40); a Needs attention row opens the pane that clears it.

### D43 · A floor is the content unwrapped (2026-09-26)

Amends D41. A pane's floor is the height its text and values take laid out across the whole board, where nothing wraps, then the narrowest width they still fit in at that height. So the floor is never taller than the pane's default, which D41's narrowest-width-first rule made it. A plot scales and sets no floor of its own (`--figure-h-floor` is gone, and a donut's ring gives way to its legend); only text and figures hold a pane up. Where a box would otherwise hide its figures, it reports them: a KPI's floor is its abbreviated reading, never one capped in magnitude; a heatmap's figures clip and say so (`data-clip`); a table that scrolls sideways (`.scroller-x`) counts its full width while arranging; a calendar day is floored at the size of what it holds; a bar drawn by `Bands` fills its box rather than claiming an SVG's default height, which had held Financial progress's tracks at their tallest.

### D44 · Dashboard headlines Recent transactions and Financial progress (2026-09-26)

Recent transactions lists the latest entries from any month; a row opens its month's Transaction history. Financial progress is Planning's bullet chart; the pane opens Planning. Both reverse the spec's first cut, at the user's request.

### D45 · Only an overlap pushes a pane (2026-09-26)

A pane is pushed down only by a pane it would overlap, not by any pane ahead of it in its columns: one ahead of it can be drawn wholly below it, pushed there by a third, and a pane put in the open space above it was stranded underneath. At a resize's press, the pane and every pane drawn below it take the top they are drawn at, so a pane grown into one below it pushes that one down rather than jumping beneath it.

### D46 · Earning pace beside Spending pace (2026-09-26)

Dashboard runs the month's net income (after tax and deductions: each paycheck's `net`) up day by day against last month and your average, as Spending pace does for spending, and a day opens Transactions' calendar (D40). Recent transactions lists ten.

### D47 · Figures read as fully as their room allows (2026-09-26)

Every figure shows its fullest reading that fits: to the cent, then whole, then abbreviated (`k`), as its room shrinks. Figures read side by side switch together (a heatmap's tiles, a stat matrix, a heatmap's totals as their own set), so a column never mixes precisions. The most compact reading always holds a figure's place and is what a pane's floor is judged on (D43); a fuller one is laid over it (`Reading`, `fitReadings`). Built for KPI cards (a cents rung atop their ladder), heatmaps, stat matrices and the split card, whose headline's change moves under the figure, as the Accounts mock drew it. Still to do: figures in columns sized to their content (lists, Spending by category, the donut's legend, Log balances' totals, the calendar).

### D48 · A headline links by its title (2026-09-26)

A card that headlines another page's figures opens that page from its title alone, underlined on hover, and not while its labels are being named in Edit. It opens the page as the sidebar does, at the view and state it was left in (D33), with no period or scope of its own. The card's figures and bars do not link. Supersedes the whole-card links D42 built.

### D49 · Edit shows the saved board (2026-09-26)

A pane reserves the same room in Edit as out of it. A capped pane no longer holds its whole ceiling open while arranging; the ceiling is drawn as a dashed outline over what lies below, with its bottom edge where it is dragged. A table that scrolls sideways (`.scroller-x`) keeps its content's height out of Edit too, so a pane on a set height scrolls as a whole rather than clipping rows inside the table.

### D50 · The range switch reads Monthly and Yearly (2026-09-26)

Amends D19's labels: the switch on Analytics and Accounts reads Monthly and Yearly. The views and their paths are unchanged.

### D51 · The user's arrangement is every board's default (2026-09-26)

Per D14, every board's default is now the arrangement the user stored: panes, height modes, KPI merges and how each merged card divides (`KpiMerge.weights`). Analytics lays its income chain out as two columns on Monthly and as a strip with the rates stacked beside it on Yearly. A board rendered with no storage matches the stored one pane for pane.

### D52 · Planning's assumptions sit in a pane (2026-09-26) · amended by D59

On Planning, the planning panel's controls are the Financial planning pane, beside the figures they move; the Adjust button and its modal are gone. D16 does not apply: it governs rows. The controls move a draft every pane on the page draws; nothing is written until Save changes, which then reads `Saved.` until the next change, and leaving the page drops an unsaved draft, as Log balances does. Each control's Default sits right after its hint.

### D53 · The projection reads ages and does not pick (2026-09-26)

An exception to D39: Projected investments' axis is future years, and no pane reads a period to narrow to, so a click does nothing. Its hover reads every line's balance under the year and the age you are that year (`MultiSeries.notes`).

### D54 · A crowded axis of years names every fifth (2026-09-26)

Amends D31 and D35 at the user's request, first for Planning's projection. Where an axis whose labels are all years would crowd, it names every fifth year flat, or every tenth, twentieth, twenty-fifth or fiftieth where that still crowds, and each year keeps its name on hover (`steppedYears` in `lib/charts/axis.ts`).

### D55 · The FI date replaces Years of freedom (2026-09-26)

Years of freedom divided net worth by logged spending as if money earned nothing, paid no tax and could all be spent today, so it read neither the plan nor the projection. Planning's KPI is now the FI date: the year the Investing line reaches the FI number, with the age then. It reads off the projection, so the two cannot disagree.

### D56 · The projection draws market risk (2026-09-26)

Projected investments draws the middle 80% of 1,000 simulated markets as a band behind Investing, each year's real return drawn around the expected one at a new setting, Return volatility (default 15%). The line under it gives the share that last to the horizon age and when the worst tenth runs out. The runs are seeded, so the band holds still until an assumption moves; at zero volatility there is no band.

### D57 · Planning checks access before 59½ (2026-09-26) · superseded by D58

A pane compares what is reachable without the early-withdrawal penalty at retirement (liquid cash; the taxable bucket, grown with out-of-pocket investing; Roth IRA contributions, a new setting) against what the years to 59½ need at planned spending. It reads the buckets rather than per-account tax types, which the ledger does not record; tax on withdrawals was mocked and not taken.

### D58 · Access before 59½ is removed (2026-09-27)

Supersedes D57 after dogfooding: the pane and its Roth IRA contributions setting are gone.

### D59 · Planning is a summary, a projection and grouped steppers (2026-09-27) · amended by D60

Chosen from [mocks/planning-layouts.html](mocks/planning-layouts.html) after dogfooding the first build. The page leads with `You reach FI in <year>, at <age>, with success rate of <N>%.` over the plan's milestones on one timeline, Financial progress beside it as rings (Dashboard keeps the bars), the projection full width, then the assumptions in three panes (Market, Timeline, Spending and saving) as − and + steppers whose readings also take typing. Save and Discard sit in the page header. Supersedes D52's single Financial planning pane and its per-control Default.

### D60 · Planning's figures are typed, and its summary scales (2026-09-27)

Amends D59 after trying it: the assumptions are typed into fields, stepped by the arrow keys, with Default right after each hint, as before D59; no − and + buttons. The summary sentence keeps to one line, its type scaled to the pane (`scaleToFit` in `lib/ui/fit.ts`), rather than wrapping into a ragged stack; below the smallest readable size, as on a phone, it wraps. The timeline scales with its pane rather than hugging its content: the rail spans the width and thickens with the pane's height. Birth year is a field like the rest.

### D61 · Planning's figures slide again (2026-09-27)

Amends D60: each figure keeps its typed field and Default, and gains back its slider under it, since watching the lines move while dragging is the point of the page. Birth year has none. Coast FI's note reads `reached FI by <year>`: the year today's invested balance alone, with no further contributions, reaches the FI number, so it falls before retirement exactly when Coast FI is past 100%.

### D62 · A drag holds the page and scrolls it (2026-09-27)

On every board, a move or resize holds the page at its height for the whole gesture, so measuring a pane's floor or shrinking the lowest pane no longer clamps the scroll and jumps the edge being dragged away. With the pointer near the window's top or bottom edge, the page scrolls, over the page as it was at the press, and the pane follows the pointer (`lib/layout/grid/drag.ts`).

### D63 · The timeline names its phases and counts (2026-09-27)

Chosen from [mocks/planning-timeline.html](mocks/planning-timeline.html). The rail is coloured by phase: Building (today to Coast FI), Optional coast (to FI), Optional work (to retirement), Drawing down (after); a milestone already passed, or never reached before retiring, drops the phase it would start (`plan` in `lib/data/projection.ts`). Each milestone shows the investing line's balance that year. Under the timeline: years to FI, years to retirement, the balance at retirement, and years to FI spending $5,000 less, each a figure over its words. The success rate's detail moved from the headline into the pane's caption, `<N>% of simulated runs result in lasting balance after the age of <age>.`, with the `?` after it.

### D64 · The timeline's lever, and what a timeline starting today leaves out (2026-09-27) · amended by D65

Amends D63. The last count is a lever rather than a fixed what-if: the smallest cut to yearly spending, in $1,000 steps and invested instead, that brings FI a year sooner, or within reach at all where it is not; `<$X>` over `less a year for FI in <year>`, and absent once at FI or where no cut reaches it. A milestone already behind, a retirement years ago, is left off a timeline that starts today, and the summary then reads `You're retired, ...`. A row of labels is held below the rail as well as above, so labels that crowd there never clip the counts; the pane's default is its floor, 11 rows.

### D65 · Two monthly levers (2026-09-27)

Amends D64's single lever. Two counts, each the smallest monthly change in $50 steps that brings FI a year sooner, or within reach where it is not: spending less (`spend <$X>/mo` over `less for FI in <year>`), which lowers the FI number alone, and investing more (`invest <$X>/mo` over `more for FI in <year>`), which grows the balance alone. Each is absent once at FI or where no change up to $5,000 a month gets there.

### D66 · The timeline, rebuilt (2026-09-27)

Supersedes the timeline's placement in D59 to D64 after a reported bug: every label vanished once two milestones merged. Three rows laid out by CSS alone, labels, rail, phase names, with only the rail's row flexible; labels that would collide merge into one (`groupLabels`), so there is always one row of them, each measured from its text. The rail thickens by whole grid rows of height past the pane's floor, 6px a row from 6px to 24px, so it is at its thinnest at the floor on every plan. The pane's default is that floor, 9 rows. A horizon already past says so: `Your plan runs to <age>, which has passed.` Save changes and Discard moved from the page header into a pane of their own. Checked across 19 plans at five widths and five plans at their floor, default and a tall height, in Chromium and WebKit. The row limits and the rail's thickness are computed in script (`barRange`, `railThickness`) and handed to CSS as plain lengths: Firefox rejected CSS that divided one length by another and dropped the rail's row entirely.

### D67 · The timeline narrows smoothly (2026-09-27)

Amends D66 after a reported bug: narrowing the timeline pane stopped one grid step at a time. Labels regroup a frame after the width changes, so while a resize tried narrower widths they still sat where the last width put them and read as a spill; the label row now clips across, and its floor is the width of every milestone merged into one label, which hangs on the milestones alone. The summary's floor measured its box rather than its text, so it followed whatever width the pane last had; it now measures the text (`scaleToFit`). Checked: one drag reaches the floor, repeats and a drag from wider land on the same floor, on four plans at two widths, with every label shown there.

### D68 · Money abbreviates to billions (2026-09-27)

Extends D47's readings: past a thousand million, a compact figure reads in billions (`$1.2B`), and a figure that rounds up to a thousand of its tier reads in the next one (`$1.0M`, never `$1000k`; `$1.0B`, never `$1000M`). One `tiered` in `lib/utils/format.ts` serves every compact figure and axis.

## Open


- **A card filter's figure.** When the history is filtered to one card, show "Charged to card" (full bills) beside Spent, so the gap reads as what was fronted? Or nothing. "Charged − paid" was rejected: it mostly reflects statement timing.
- **The open entry in the URL (D9).** The modal's open entry is not in the URL yet, so back does not close it.
- **Phone layout.** Suggested: bottom tab bar with the four main pages.

## Resolved elsewhere

- **Month from a year:** same calendar month in the new year, clamped to tracked months (specs/app-shell.md).
- **URL names:** `month` (each view's own, D33), and on Transactions `day`, `type`, `category`, `account`, `q` (the specs).
- **Typical month or budgets:** "average" is the mean of up to twelve prior months with data (`vsAverage`, `categoryDeviation`); no budgets.
