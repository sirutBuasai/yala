# Analytics spec

Status: draft, in review · Branch: `redesign/analytics`

## Job

Read spending and income trends across months and years, and drop into the month behind an outlier (workflow 2). The SUMMARY and OVERVIEW sheets of the spreadsheet: a year read month by month, and the whole record read year by year.

## Carries over (D6)

Activity · Year and Activity · All time move here unchanged: same components, titles, captions and charts. Activity · Month is not carried; Transactions replaced it. Sources on `master`: `lib/views/activity/YearView.svelte`, `lib/views/activity/AllTimeView.svelte`, `lib/views/activity/Activity.svelte`.

| Range | Pane | Title · caption today |
|---|---|---|
| Year | KPI cards, two columns | Gross, Deductions, Contributions, Take-home · Net income, Deduction rate, Spending rate, Savings rate |
| Year | Stat matrix | `<Year>` cash flow · comparison against previous year and run-rate |
| Year | Bars | Net income vs take-home vs spending vs saved · `<Year>` per month |
| Year | Heatmap | Category by month · category spending split per month |
| Year | Sankey | Where it all went · `<Year>` gross income to each spending category |
| All time | Stat matrix | Lifetime cash flow · `<span>` totals, yearly, and monthly rates |
| All time | Bars | Savings rate by year · of net income |
| All time | Bars | Net income vs take-home vs spending vs saved · per year |
| All time | Sankey | Where it all went · Lifetime gross income to each spending category |
| All time | Lines | Spending by category, by year · log-scaled yearly trend of spending by category |

## Owns (D3)

| Figure | Owned here? | If not, owner and link |
|---|---|---|
| Year and lifetime totals, run-rates and the income chain | Yes | |
| Cash flow by month within a year, and by year | Yes | |
| Savings rate by year, category by year | Yes | |
| Where it all went (the Sankey) | Yes | |
| Category by month for the focus year | Shared, see Decisions 1 | Transactions shows it as the month's category check |
| Any single month's figures and rows | No | Transactions, reached by the drill-ins below |
| Balances and net worth | No | Accounts |

This resolves D3's Cash flow items: Analytics has no month stats row, no month table footer and no category-against-typical table. Those were prototype inventions; the month's figures live on Transactions.

## Layout

Two boards, one per range, each with its own stored arrangement and arranging on (D14), as Activity had.

1. **Header:** `Analytics`, the range switch (`Year`, `All time`), then the year stepper in Year or the caption `Lifetime · <span>` in All time. Edit and the theme toggle at the right. No Add: this page logs nothing (D12).
2. **Year board:** today's Activity · Year layout. The focus month's row is marked in Category by month, as on Transactions.
3. **All time board:** today's Activity · All time layout.

The defaults are today's layouts. If you arranged either board on the live app, share its stored arrangement (`yala-board-activity:year-<version>`, `yala-board-activity:all-<version>`) and it becomes the default instead. The new boards are stored under `analytics:year` and `analytics:all`.

## Drill-ins

Every drill-in adds a history entry, so back returns here (D9).

- **Category by month:** a month label opens that month on Transactions; a cell opens that month filtered to its category. Same picks as the Transactions heatmap, but they leave the page, since this page has no month content.
- **Cash flow bars, Year:** a month's group of bars opens that month on Transactions.
- **Cash flow bars and Savings rate by year, All time:** a year's bars open the Year view of that year.

Bars are not pickable today. Picking needs `BarChart` to take `onpick` per group, like `RangeBars` and `Heatmap`: a hit area over the whole group, the group's band shaded on hover and focus, and each group a button named by its label. It is drawn in SVG, like every mark (`charts/marks`).

Not clickable: KPI cards (hover explains, as today), the stat matrices, the Sankey, and the category lines. None of them has a single month behind it to open.

## Click map

| Element | Action | Route and state | Back returns to |
|---|---|---|---|
| Range switch | Show Year or All time | `view` | The previous range |
| Year stepper | Step or pick a year | `month`: the same calendar month in that year, else its latest tracked month | The previous year |
| Category by month, month label | Open that month | `/transactions`, `month` | This page |
| Category by month, cell | Open that month, filtered to the category | `/transactions`, `month`, `category` | This page |
| Year bar group (a month) | Open that month | `/transactions`, `month` | This page |
| All time bar group (a year) | Open that year | `view=year`, `month` as for the stepper | All time |
| Savings rate bar (a year) | Open that year | `view=year`, `month` as for the stepper | All time |
| KPI cards | Not clickable; hover explains | | |
| Edit | Arrange the board (D14) | none | |

## Period and URL state

| Param | Values | Absent or invalid |
|---|---|---|
| `month` | `YYYY-MM`, shared (D4) | The latest tracked month |
| `view` | `year`, `all` | `year` |

The Year board reads its year from `month`. Stepping the year moves `month` with the shell's rule (`monthForYear`), so Transactions then opens on the matching month. All time leaves `month` alone, so switching back or changing page keeps your place.

The stepper offers only years that hold a pickable month. Activity also offered the empty year after the latest, but `month` cannot name a month there.

## Build steps

1. **The page.** The header, both boards carried over, `view` and the year in the URL, the focus month marked in Category by month. Add both boards to the `charts` and `steady` browser tests.
2. **Drill-ins.** Category by month picks, then `BarChart` picking and the bar drill-ins, with browser tests for each route and for back.

Each step is dogfooded before the next.

## New UI strings

- `Analytics time range`: the range switch's accessible name, replacing `Activity time range`.
- Bar groups are named by their axis label: the month (`Sep`) or the year (`2026`).

## Out of scope

Month figures and rows (Transactions), net worth (Accounts), projections (Planning), and any chart or copy change (D6).

## Decisions for you

1. **Category by month on both pages.** Suggested: yes, per your hunch. On Transactions it is the instant per-category sum while logging; here it is the year's SUMMARY table, whose cells open the month behind an outlier. Both draw from one builder, so the numbers cannot disagree. The alternative is to leave it off here and have the Year view link to Transactions for it.
2. **Where it all went.** Suggested: it stays a full-width pane on both boards, for the focus year and for the lifetime, as today. The prototype's toggle inside a "Where it went" card was new and is dropped. This closes the Sankey item in decisions.md.
3. **Bar picks.** Suggested as above: a month's bars open Transactions, a year's bars open the Year view. A mock of the hover band can come before step 2 if you want to see it first.

## Open questions

- Should Year mark the focus month in the per-month bars too, like the heatmap? It would be a chart change (D6), so it waits for a mock unless you want it.

## Dogfood checklist

- Step through years; the heatmap and bars follow, and Transactions opens on the matching month.
- Spot an outlier cell, open it, fix a row, and go back to the same year and range.
- From All time, open a year, then back.
- Reload any view; it is identical.

## Dogfood notes
