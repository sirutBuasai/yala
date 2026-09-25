# Analytics spec

Status: built, dogfooding · Branch: `redesign/analytics`

## Job

Read spending and income trends across months and years, and drop into the month behind an outlier (workflow 2). The SUMMARY and OVERVIEW sheets of the spreadsheet: a year read month by month, and the whole record read year by year.

## Ranges (D19)

The range switch names the grain of the bars:

- **Month:** one year, a bar per month. Was Activity · Year.
- **Year:** the whole record, a bar per year. Was Activity · All time.

Activity · Month is not carried; Transactions replaced it.

## Carries over (D6)

Sources on `master`: `lib/views/activity/YearView.svelte`, `lib/views/activity/AllTimeView.svelte`, `lib/views/activity/Activity.svelte`.

| Range | Pane | Title · caption |
|---|---|---|
| Month | KPI cards, two columns | Gross, Deductions, Contributions, Take-home · Net income, Deduction rate, Spending rate, Savings rate |
| Month | Stat matrix | `<Year>` cash flow · comparison against previous year and run-rate |
| Month | Bars | Net income vs take-home vs spending vs saved · `<Year>` per month |
| Month | Heatmap | Category by month · category spending split per month |
| Month | Sankey | Where it all went · `<Year>` or `<Mon Year>` gross income to each spending category |
| Year | KPI cards, two columns | As on Month. **New to this board.** |
| Year | Bars | Net income vs take-home vs spending vs saved · per year |
| Year | Bars | Savings rate by year · of net income |
| Year | Stat matrix | Lifetime cash flow · `<span>` totals, yearly, and monthly rates |
| Year | Heatmap | Category by year · category spending split per year. **New.** |
| Year | Sankey | Where it all went · `Lifetime` or `<Year>` gross income to each spending category |
| Year | Lines | Spending by category, by year · log-scaled yearly trend of spending by category |

The prototype's "Where it went" category bars are not carried; the Sankeys are (D18).

## Owns (D3)

| Figure | Owned here? | If not, owner and link |
|---|---|---|
| Year and lifetime totals, run-rates and the income chain | Yes | |
| A month's income chain read against its average | Yes, as the board narrowed to that month | Transactions' KPI bar has income, take-home, saved and spent |
| Cash flow by month within a year, and by year | Yes | |
| Savings rate by year, category by year | Yes | |
| Where it all went (the Sankey) | Yes | |
| Category by month for the focus year | Shared (D17) | Transactions shows it as the month's category check |
| A month's rows | No | Transactions, through the heatmap |
| Balances and net worth | No | Accounts |

## Picking a period (D20)

A bar chart selects; it never leaves the page. Picking a period narrows the board to it, and picking it again widens the board back.

- **Month:** picking a month's bars narrows the KPI cards and the Sankey to that month and outlines its row in Category by month. The KPI amounts then read against the month's average, with the difference as their badge and the trailing twelve months behind them; the rates read that month. The stat matrix and bars stay on the year.
- **Year:** picking a year's bars, on either bar chart, narrows the KPI cards and the Sankey to that year and marks it on both bar charts, in Category by year and in the category lines. A year's KPI cards carry their running total and no badge, since a part-finished year would read as a collapse. The stat matrix stays on the lifetime.
- The picked period's bars stay full strength and the rest recede, with its column shaded and its label raised.
- A group of bars with nothing in it, such as a month still to come, cannot be picked.

Only the heatmap leaves the page: on Month, a Category by month label opens that month on Transactions, and a cell opens it filtered to its category. Category by year is not clickable: Transactions has no year to open.

## Click map

| Element | Action | Route and state | Back returns to |
|---|---|---|---|
| Range switch | Show Month or Year; widens the board | `view`, drops `scope` | The previous range |
| Year stepper (Month) | Step or pick a year | `month`: the same calendar month in that year, else its latest tracked month | The previous year |
| Month bars | Narrow to that month; again widens | `month`, `scope=month` | The previous scope |
| Year bars, Savings rate bars | Narrow to that year; again widens | `month` as for the stepper, `scope=year` | The previous scope |
| Category by month, month label | Open that month | `/transactions`, `month` | This page |
| Category by month, cell | Open that month, filtered to the category | `/transactions`, `month`, `category` | This page |
| KPI cards, stat matrices, Sankey, lines, Category by year | Not clickable | | |
| Edit | Arrange the board (D14) | none | |

## Period and URL state

| Param | Values | Absent or invalid |
|---|---|---|
| `month` | `YYYY-MM`, shared (D4) | The latest tracked month |
| `view` | `year` | Month |
| `scope` | `month` on Month, `year` on Year | The board's whole span: the focus year on Month, the lifetime on Year |

The Month board reads its year from `month`. The stepper offers only years holding a pickable month, since `month` cannot name a month in any other.

## Layout

Two boards, one per range, each arrangeable (D14) and stored under `analytics:month` and `analytics:year`. Month keeps Activity · Year's layout. Year opens with the KPI cards beside the two bar charts, then the stat matrix, Category by year, the Sankey and the lines.

## Build notes

- `BarChart` takes `onpick` and `picked`: a band over each period is a button, and the bars pick through to it.
- `LineChart` takes `mark`, the period shaded behind its lines. Bars and lines share `.focusband` and `text.focused` in `app.css`.
- `money.flow` reads any scope. Spending past take-home is paid from a `From savings` node, which a month without a paycheck always needs.
- `vsavg.*` and `trend.*` cover the whole income chain.
- `lib/nav/step.ts` is the one way a page steps its URL state; Transactions uses it too.

## New UI strings

- `Month`, `Year`: the range switch; `Analytics time range` is its accessible name.
- `Category by year` · `category spending split per year`.
- `From savings`: the Sankey node.
- Bar groups are named by their axis label, e.g. `Sep`, `2025`.

## Tests

Analytics is on `BOARD_PAGES`, so `charts` and `steady` cover its Month board. `analytics.spec.ts` covers narrowing and widening on both ranges, the range switch, and the heatmap's drill-in with back.

## Out of scope

Month rows (Transactions), net worth (Accounts), projections (Planning).

## Open questions

- **Stat matrices.** They repeat figures the KPI cards show. Rework them once dogfooding shows which comparisons are used.
- **Header while narrowed.** Only the panes' captions and the marks say a period is picked. A chip in the header, with a clear, may read better.
- **A year against its average.** A year's KPI cards carry no badge; a run-rate comparison could stand in if one is missed.
- **Category by year clicks.** A cell could open that year on Month, filtered in some way; nothing yet.

## Dogfood checklist

- Pick a month, read its KPIs and Sankey, pick it again; the year returns.
- Step through years; Transactions then opens on the matching month.
- Spot an outlier cell, open it, fix a row, and go back to the same year and scope.
- On Year, pick a year from either bar chart; every year axis marks it.
- Reload any view; it is identical.

## Dogfood notes
