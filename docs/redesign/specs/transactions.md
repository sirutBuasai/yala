# Transactions spec

Status: decided, building · Branch: `redesign/transactions`

## Job

Log a month and verify it as you go (workflow 1), and land here from any figure elsewhere to see the rows behind it (principle 2). The month sheet of the spreadsheet: its rows, its totals, and the year summary one glance away.

## Carries over (D6)

Every pane below exists today and moves here unchanged: same component, title, caption and chart. Sources on `master`: `lib/views/home/Home.svelte`, `lib/views/activity/MonthView.svelte`, `lib/views/activity/YearView.svelte`.

| Pane | Title · caption today | From |
|---|---|---|
| KPI cards, two chains | Income, Take-home, Saved · Spent, vs your average, Spending rate | Activity · Month |
| Donut | Where your income went · `<Month>` income and spending split | Activity · Month |
| Deviation | Unusual this month · deviation from monthly averages | Activity · Month |
| Heatmap | Category by month · category spending split per month | Activity · Year |
| Calendar | Log activity · `<Month Year>` | Home |
| Day list | `<Month D, Year>` · `N transactions · +$X income`, with `+ Add entry` | Home |
| Pending | Pending transactions · waiting for posting, refunds, or credits | Home, Activity · Month |
| Paychecks | Paychecks · `N in <Month Year>` | Activity · Month |
| Bill pay | Bill pay & transfers · `N in <Month Year>` | Activity · Month |
| History | Transaction history · `N in <Month Year>`, with sort | Activity · Month |

Home's three-card strip (Income, Spent, Saved) is not carried: Activity · Month's six cards include all three.

## Owns (D3)

| Figure | Owned here? | If not, owner and link |
|---|---|---|
| The month's rows: transactions, paychecks, bill pay, pending | Yes | |
| The month's KPI cards, donut and deviation | Yes | Dashboard may show a headline that links here |
| Category by month for the focus year | Yes, as the month's category check | Whether Cash flow shows it too is decided in its spec |
| Balances and their checks | No | Accounts (D12) |
| Year totals, run-rates, multi-year trends, the Sankey | No | Cash flow |

## Layout

A board with arranging on (D14). The default below follows today's rectangles; the user's own arrangement replaces it once they have one.

1. **Header:** `Transactions`, the month picker, `+ Add entry`, the theme toggle.
2. **The month at a glance:** the two KPI chains, Where your income went, Unusual this month. The same row as Activity · Month today.
3. **Category by month** for the focus month's year. Its rows are months and its columns categories, with sums in every cell and Total rows and columns, so the focus month's row is the spreadsheet's Total row: how much each category has taken so far. The focus month's row is marked; that mark is the one visual change on this page.
4. **Log activity** calendar with its day list and Pending transactions beside it, as on Home.
5. **Transaction history**, then **Paychecks** and **Bill pay & transfers**, as on Activity · Month.

## Click map

| Element | Action | URL state | Back returns to |
|---|---|---|---|
| Month picker | Step or pick a month | `month` | The previous month |
| `+ Add entry` (header) | Add modal offering Transaction, Bill pay, Paycheck (D12) | none | |
| `+ Add entry` (day list) | The same modal, dated to that day | none | |
| KPI cards | Not clickable; hover explains, as today | | |
| Donut slice | Filter the rows to that category; the savings slice does nothing | `category` | Unfiltered |
| Unusual this month row | Filter the rows to that category | `category` | Unfiltered |
| Category by month cell | Move to that month and filter to that category | `month`, `category` | The previous month, unfiltered |
| Category by month column header | Move to that month | `month` | The previous month |
| Calendar day | List that day | `day` | No day |
| A row, in a wide list | Edit inline, with More for the rest of the form (D7, D10) | `entry` | Editor closed |
| A row, in the day list or a narrow pane | Edit in a modal (D7, D11) | `entry` | Editor closed |
| Filter chip `×` | Clear that filter | removes it | The filter back |
| Sort menu | Reorder the history | none: a preference, kept in the browser | |

Rows shown on other pages open the same editor in place (D8); nothing there routes here to edit.

## Decisions (2026-09-24)

1. **Board width:** icon rail (D13), built first on this branch since this is the first page with a board.
2. **Category by month:** on this page, as above. The user's need is an instant per-category sum while logging, which a donut does not give.
3. **Rows:** both, as today: the calendar with its day list, then the three lists.
4. **Arranging:** on (D14).

## Period and URL state

`month` (D4), plus `category`, `day`, `view` and `entry`. Sort stays a browser preference.

## Out of scope

Balances (Accounts), multi-year trends (Cash flow), and any chart or copy change (D6).

## Tests to restore from `master`

`entries.spec.ts`, the modal and date picker cases in `a11y.spec.ts`, the dropdown and popup cases in `overlay.spec.ts`, and the board suites (`charts`, `steady`, `arrange`) pointed at this page.

## Dogfood checklist

- Log a week of real entries; each shows up in the KPI cards, the donut and Category by month without leaving the page.
- Spot an outlier cell, open it, fix a row, and go back.
- Back and forward across month steps and filters (carried from the app shell).

## Dogfood notes
