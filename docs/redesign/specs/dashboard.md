# Dashboard spec

Status: building · Branch: `redesign/dashboard`

## Job

Where do I stand, and what needs attention. Opened first: a glance at this month and net worth, then a short list of what only you can fix, each item opening the pane that fixes it. It replaces Home's figure strip; Home's logging moved to Transactions and Accounts. The spreadsheets had no analogue: it joins the two files.

The page reads now, not a period. It has no stepper, no view switch and no picks (see Period and URL state).

## Revised (2026-09-25)

After the headline cards were built, the user replaced them with a split card (D38), a Net worth KPI and Spending pace, and made line and area charts pick on every page (D39). Needs attention was approved from its mock and built.

## Panes

| Pane | Title · caption | Status |
|---|---|---|
| Split card | Cash flow · `as of <Mon Year>`: Income split into Spent and Saved, then Spent split into categories (D38) | Built |
| KPI card | Net worth · `as of <Mon Year>`, its change that month, the year's snapshots as an area scaled to their own range | Built |
| Line | Spending pace · `<Mon Year>` · spending to date against `<last month>` and your average, with a summary line under it | Built |
| List | Needs attention · `N` | Built, as mocked in [mocks/dashboard-panes.html](../mocks/dashboard-panes.html) |
| List | Recent transactions · the latest entries, newest first: the ten latest from any month (D44, D46) | Built |
| Line | Earning pace · `<Mon Year>` · net income to date against `<last month>` and your average: paychecks' net, after tax and deductions (D46) | Built |
| Bullets | Financial progress · key metrics for financial independence: Planning's pane, carried from Net Worth · All time (D44) | Built |

The Income bar's shares are of income: Spent past 100% means the month spent more than it earned, and Saved is then zero. A month with no income shows its parts by amount, Spent alone and Saved at zero. The Spent bar names as many categories as its key fits on one line, the rest rolled into `Other`.

Spending pace draws `Spent` (the month's running spend, to today in a month still running), `Last month` dashed and `Average` (the mean of up to twelve prior months), each summed to the same day. Its summary reads `$X spent by the <Nth>, ±$Y against <last month> at the same day.` Spending nets refunds, so the line ends at the Cash flow card's Spent.

A KPI's underlay is zero-anchored, which draws a level such as net worth as a flat block; `level` scales it to the series' own range instead.

Not carried from Home: the calendar, the day's entries and Pending (Transactions), Log balances (Accounts). Not carried from the prototype: the bridge card.

## Owns (D3)

| Figure | Owned here? | If not, owner and link |
|---|---|---|
| Needs attention: what is outstanding across the ledger | Yes | Each item links to the pane that clears it |
| Spending pace: the month's running spend by day | Yes | Each day opens Transactions' calendar |
| The month's income, spent and saved, and its categories | No | Analytics. The Cash flow card opens its Month view narrowed to the month |
| Net worth | No | Accounts. The KPI opens its Net worth card |
| Pending rows, balances logged, categories against their range | No | Transactions, Accounts, Transactions. Counted here, listed by their owners |
| Recent transactions | No | Transactions. A row opens its month's history |
| Financial progress | No | Planning. The pane opens it |

## Which month

"This month" is the latest tracked month (`latestMonthKey`), as Home and every page's default read it. Spending pace draws it through today when it is today's month, else in full. Balances logged reads today's month, since a month's balances land on its first, before anything is spent in it. Net worth reads its latest snapshot month.

## Layout

One board, arrangeable (D14), stored under `dashboard`: Cash flow over Needs attention on the left; Net worth over Spending pace on the right. The user sets the layout.

### Needs attention

Pending first, then Balances, then one row per category, furthest above its range first. A row shows only when there is something to fix. An empty list reads `Nothing needs attention.`

| Item | Shown when | Row reads | Opens (D34) |
|---|---|---|---|
| Pending | Any transaction in any month is pending (`pendingRows`) | `N pending transactions` · `waiting for posting, refunds, or credits` | Transactions at Pending transactions |
| Balances | An account open this month has no snapshot in it (`/api/networth` `standing` against the month's roster) | `N of M accounts not logged for <Month>` · the accounts' names | Accounts · Month at Log balances, today's month; the first unlogged account focused |
| Category | A category's spend this month is above the highest of its prior months (`categoryDeviation`'s `hi`, the ring Spending by category draws) | `<Category> is above its usual range` · `$X so far, usual $avg ($lo–$hi)` | Transactions at Transaction history, the month filtered to the category |

The Balances item needs the API: in a read-only snapshot it is left out rather than guessed. The prototype's `Card B is off by $X` is not an item: past its baseline, Log balances refuses a card reading that does not reconcile, so no such state is ever saved.

### Spending pace

Three lines on a day axis (1 to the month's last day): this month's running spend to today, last month's, and your average month's, where average is the mean of up to twelve prior months with data, as everywhere else. A line under it reads `$X spent by the <Nth>, <±$Y> against <last month> at the same day.` Spending nets refunds, as Spent does, so the line's end equals the Spent card.

## Click map

| Element | Action | Route and state | Back returns to |
|---|---|---|---|
| Cash flow title | Open Analytics as the sidebar does (D48) | `/analytics` | Dashboard |
| Net worth title | Open Accounts as the sidebar does (D48) | `/accounts` | Dashboard |
| Spending pace or Earning pace, a day | Open that day in the calendar (D34, D40) | `/transactions`, `month`, `day`, at Log activity | Dashboard |
| Needs attention row | Open the pane that clears it (D34) | As in the table above | Dashboard |
| Recent transactions title | Open Transactions as the sidebar does (D48) | `/transactions` | Dashboard |
| Recent transactions row | Open its month at Transaction history (D34) | `/transactions`, `month` | Dashboard |
| Financial progress title | Open Planning as the sidebar does (D48) | `/planning` | Dashboard |
| Cash flow bars, Net worth figure, Financial progress bars | Nothing: only a title links (D48) | | |
| Edit | Arrange the board (D14); cards stop opening while arranging | none | |

Every link is a drill-in through `drillTo`, naming its own month and filters, so the page it opens is not left as it was (D33, D34).

## Period and URL state

None: the page reads now, so its URL is `/`.

## Decisions (2026-09-25)

The user approved building with every recommendation below, to dogfood, and asked that any new design be shown as a mock before it goes in. Captions read `as of <Mon Year>` on the four month cards.

1. **Cash flow headline.** Recommended: Home's strip as is (Income, Spent, Saved against last month), each opening Transactions. The alternative, Transactions' against-average cards, would be a second copy of its KPI bar.
2. **Savings rate headline.** Recommended: keep, as the one year-level reading. It already appears on Analytics and, as an exception, Accounts; the alternative is to leave it out.
3. **Recent transactions.** Recommended: drop. Transaction history already runs newest first; a Dashboard list would be its second copy (D3). Pending, the rows that need you, are in Needs attention.
4. **The bridge.** Recommended: headline only. Net worth opens Accounts narrowed to the month, whose Saved and Market & other cards are the bridge.
5. **Spending pace.** Recommended: build it, after a mock with your real month shape; it is the one new chart, and mid-month it is what catches odd spending before the month closes.
6. **No period control.** Recommended: none, since the page reads now. Looking back is Transactions' and Analytics' job.

## Build steps

1. ~~Headline KPI cards~~ (built, then replaced).
2. **Split card (built).** `SplitPane` and `SplitBar` (D38), here and on Accounts · Month.
3. **Line and area picks (built).** On Accounts · Month and Year and Analytics · Year (D39).
4. **Net worth KPI and Spending pace (built).**
5. **Needs attention (built).** `attentionItems` holds the rules; the balances row reads `/api/networth` and is left out in a read-only snapshot.
6. **One floor per pane (built, D41, D43).** Measured once per resize from the content unwrapped; merged KPI tracks never go below a section's floor.
7. **Recent transactions and Financial progress (built, D44).**
8. **Earning pace (built, D46).** One `pace` builder and one `PacePane` serve both paces.

## New UI strings

- `Cash flow` · `as of <Mon Year>`: the split card's title and caption; `as of <Mon Year>` on Net worth too.
- `Spent`, `Last month`, `Average`: Spending pace's lines.
- `Income`, `Spent`, `Saved`, `Other`: the split bars' labels and keys.
- `Spending pace` and its caption and summary line, as above.
- `Needs attention`, `Nothing needs attention.`
- `N pending transactions`, `N of M accounts not logged for <Month>`, `<Category> is above its usual range`.
- `$X so far, usual $avg ($lo–$hi)`: Spending by category's hover wording, with `so far`.

## Tests

Dashboard joins `BOARD_PAGES`, so `charts`, `steady` and `arrange` cover it. `dashboard.spec.ts` covers the card's drill-in with back, no drill-in while arranging, and the key naming fewer categories when narrower. It also covers the Net worth KPI's drill-in and a pace day opening the calendar. `accounts.spec.ts` covers line picks on both views. `incomeParts`, `netWorthParts`, `pickKeys` and `pickGroups` have unit tests; `owed` has an API test.

## Out of scope

Logging of any kind (D12), a month's rows (Transactions), trends (Analytics), balances and the bridge in full (Accounts), projections (Planning), and budgets (average stays the norm).

## Open questions

- **More attention items.** A month with no paycheck, or a card's bill not yet paid, could join once dogfooding shows they are missed. None is added now: each would be a new rule.
- **Phone layout** (Open, in decisions): Dashboard would be the first tab.

## Dogfood checklist

- Open the app mid-month; the Cash flow card agrees with Transactions' KPI bar.
- Resize the Cash flow card; the Spent key names more categories as it widens.
- Make any pane short, then wide, then narrow; it narrows back to the same floor.
- Clear each attention item from its link, then go back; the item is gone.
- Arrange the board; cards do not open while arranging.

## Dogfood notes
