# Transactions spec

Status: step 1 revised to the new layout, in review · Branch: `redesign/transactions`

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

## Layout (revised 2026-09-25)

A board with arranging on (D14). Mock: [mocks/transactions-layout.html](../mocks/transactions-layout.html).

1. **Header:** `Transactions` and the month picker; Edit and the theme toggle at the right. Adding lives in the panes: `+ Add` on the day's entries (dated to that day) and on Transaction history.
2. **KPI bar:** Income, Take-home, Saved and Spent, four KPI cards opened merged along one row, each with its bar underlay and its distance from your average (`vsavg.*`). KPI values keep the display size. The badge shows the difference alone, e.g. `+$1,000`; the caption names the average.
3. **Log activity**, with Pending transactions and the day's entries beside it.
4. **Transaction history** (left): transactions, paychecks and bill pay in one list, newest first and grouped by day, laid out as: the type chips with the category and account menus on one row, the summary, then search on the left and sort on the right, all pinned while the list scrolls. Filters and search live in the URL; Pending only was dropped, since Pending transactions has its own pane. **Spending by category** (right): each category's total as a bar on one shared scale, its usual range and average over it, then Total and Δ average columns under a Category header (`range-bars`, replacing the dumbbell). Its markers are SVG circles, so the out-of-range ring stays even at any position.
5. **Where your income went** and **Category by month**, the focus month's row marked.

Dropped: the six KPI cards (Spending rate and vs your average with them), Unusual this month, and the separate Paychecks and Bill pay & transfers panes.

### History summary

It reads the rows the filters leave, never the filters: Spent when transactions remain (refunds netted), Take-home when paychecks remain, Bill pay & transfers when bill pay remains, and vs your average when every transaction left shares one category. The caption counts rows, as `N of M in <month>` while filtered.

## Drill-ins (built)

- A Spending by category row filters the history to its category; clicking the chosen row again clears it. The chosen row is marked.
- A Category by month month label moves the page to that month; a cell moves to its month and filters the history to its category. The filtered category's column header is marked.

Every graphic mark is SVG (`charts/marks`: Dot, Swatch, Bands). Category by month stays an HTML table, since it is one: its axes are headers a screen reader announces.

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
| A row, anywhere | Edit in the entry modal (D16) | none yet | Editor closed |
| Filter chip `×` | Clear that filter | removes it | The filter back |
| Sort menu | Reorder the history | none: a preference, kept in the browser | |

Rows shown on other pages open the same editor in place (D8); nothing there routes here to edit.

## Decisions (2026-09-24)

1. **Board width:** icon rail (D13), built first on this branch since this is the first page with a board.
2. **Category by month:** on this page, as above. The user's need is an instant per-category sum while logging, which a donut does not give.
3. **Rows:** both, as today: the calendar with its day list, then the three lists.
4. **Arranging:** on (D14).

## Build steps

1. **The page (built).** The icon rail (D13), every carried pane on the board with arranging on, the focus month's row marked in Category by month, `month` and `day` in the URL, and the page's `+ Add entry` offering Transaction, Paycheck and Bill pay. Rows edit in the current modals.
2. **Drill-ins.** The click map's filters: donut slices, Unusual this month rows and Category by month cells set `category` (and `month`), with a filter chip on the lists.
3. ~~Inline editing.~~ Dropped: every edit opens in the modal (D16).

Each step is dogfooded before the next.

## Period and URL state

`month` (D4), plus `category`, `day`, `view` and `entry`. Sort stays a browser preference.

## Out of scope

Balances (Accounts), multi-year trends (Cash flow), and any chart or copy change (D6).

## Tests

Restored from `master` and pointed at this page: `entries`, `charts`, `steady`, `arrange`, and the modal, date picker, dropdown and popup cases of `a11y` and `overlay`. Not restored: `arrange`'s merged-section cases, which need a KPI strip merged along a row (Home's); they return with the first page that has one. `planning` and `slider` return with Planning.

## Dogfood checklist

- Log a week of real entries; each shows up in the KPI cards, the donut and Category by month without leaving the page.
- Spot an outlier cell, open it, fix a row, and go back.
- Back and forward across month steps and filters (carried from the app shell).

## Dogfood notes

- 2026-09-25: The user's arranged Transactions layout became the default (D14): Spending by category shortened beside the history, Where your income went under it, and Category by month full width at the bottom.
