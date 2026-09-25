# Accounts spec

Status: steps 1 and 3 built, step 2 on Month built; dogfooding · Branch: `redesign/accounts`

## Job

Log every account's balance for a month and check it against the ledger (workflow 1), then read how net worth moved and why (workflow 2). The Net Worth tracker of the spreadsheet: one row of balances per month, its totals, and the month-over-month differences.

## Views (D19, D27)

Named by the grain of their bars, as on Analytics:

- **Month:** one year, month by month, at `/accounts`. Was Net Worth · Year, plus Home's balance checklist.
- **Year:** the record, year by year, at `/accounts/year`. Was Net Worth · All time.

Logging lives on Month only: a balance belongs to the month it was taken in, which is why All time was read-only.

## Carries over (D6)

Sources on `master`: `lib/views/networth/NetWorth.svelte`, `YearView.svelte`, `AllTimeView.svelte`, `copy.ts`, and `lib/balance/BalanceChecklist.svelte` as Home placed it.

| View | Pane | Title · caption |
|---|---|---|
| Month | KPI cards, two merged rows | Net worth (line), Savings rate (ring) · Saved, Market & other (bars) |
| Month | Stat matrix | `<Year>` growth · year total and monthly rates |
| Month | Checklist | Log balances · snapshot of each account's balance on `<date>`. **New to this board**, from Home |
| Month | Line | Net worth & assets · `<Year>` total net worth and assets MoM |
| Month | Stacked area | Asset allocations · dollar amount and shares by asset type |
| Month | Line | Liabilities · `<Year>` total liabilities MoM |
| Month | Bars | You vs the market, by month · `<Year>` direct savings vs market gains + other income |
| Month | Bars | Change by asset type · `<Year>` dollars gained or lost each month |
| Month | Heatmap | Monthly snapshots · changes to net worth, assets, and liabilities MoM. **Was a table**; its tinted columns shade its tiles |
| Year | KPI cards, one column | Net worth, Assets, Liabilities, Growth rate (bars by year) |
| Year | Stat matrix | Lifetime growth · `<span>` totals, yearly, and monthly rates |
| Year | Line | Net worth & assets · total lifetime net worth snapshots |
| Year | Line | Liabilities · total lifetime liabilities snapshots |
| Year | Ranked bars | Where the money sits · asset allocation as account balances. **Now opens an account in Log balances** |
| Year | Stacked area | Asset allocations · dollar amount and shares by asset type |
| Year | Bars | You vs the market, by year · direct savings vs market gains + other income |
| Year | Bars | Change by asset type · `Lifetime` dollars gained or lost each year |
| Year | Heatmap | Yearly snapshots · changes to net worth, assets, and liabilities YoY. **Was a table**, as above |

Moved to Planning: Financial progress (with Adjust and the planning panel) and Years of freedom. Not carried: Net Worth's `+ Log balance` and its one-account form; Log balances logs every account. Not carried from the prototype: its single net worth chart with a 6M/1Y/All picker (the two views already cover it), the account cards with sparklines (`data.json` has no per-account history; D6), and the separate "How net worth moved" card (the KPI cards become it, below).

## Owns (D3)

| Figure | Owned here? | If not, owner and link |
|---|---|---|
| Account balances, their checks against the ledger, and how many are logged for a month | Yes | Dashboard may show "N of M logged" as a headline linking to `/accounts?month=` |
| Net worth, assets, liabilities, allocation, and their history | Yes | Dashboard may show net worth as a headline linking here |
| The net worth bridge: a period's change split into Saved and Market & other | Yes, as the KPI cards narrowed to that period | Dashboard headline links here with `scope=month` |
| Savings rate | No | Analytics. The ring stays on the Month board for now, an exception to D3. It is saved ÷ net income for the focus year; Analytics' `lifetime` line is the same ratio over the whole record |
| Financial progress, Years of freedom, the planning assumptions | No | Planning |
| A month's rows | No | Transactions. Nothing here drills into rows: a balance has none behind it |

Saved is the same income − spending that Transactions and Analytics show. It stays here because it is a term of the bridge, not a cash-flow reading.

## Picking a period (D20)

A bar chart selects in place; picking the picked period again widens back.

- **Month:** picking a month on You vs the market or Change by asset type narrows the KPI cards to that month and marks it on every chart with a month axis, the lines and the stacked area included, and outlines its row in Monthly snapshots. Net worth then reads at the month's end with its change that month, and Saved and Market & other read that month's split: this is the bridge. The stat matrix stays on the year. The Log balances pane follows the focus month whether or not it is picked. The lines and the stacked area plot each snapshot, so a month with two marks both.
- **Year:** picking a year on either bar chart narrows the KPI cards to that year's close, marks it on every year axis and outlines its row in Yearly snapshots. The stat matrix stays on the window.
- A period with no snapshot has no bars and cannot be picked.

The narrowed KPI cards must read the same window as the month's bars (`monthOverMonth`, the freshest reading in each month), not `bounds`, or the card and the bar it was picked from would disagree.

## Time frame (D23, D25)

The Year view takes Analytics' 5Y, 10Y, 20Y, 50Y and All, ending at the latest year, 10Y by default, as `span`. The window scopes the whole board, lifetime lines included; titles and captions drop "Lifetime" and name the years instead. A year with no snapshot keeps its place on every year axis. Where the money sits reads today and ignores the window.

## Layout

Two boards, each arrangeable (D14), stored under `accounts:month` and `accounts:year`. Each starts from your stored `networth:year` and `networth:all` arrangement, which I will ask you to copy from the browser at build time. On Month, Log balances goes full width under the KPI cards, since logging is the page's first job; everything else keeps its place.

The header: `Accounts`, the Month and Year switch, then on Month Analytics' year stepper, on Year the span picker. Logging is Log balances alone: there is no `+ Log balance` button. Edit and the theme toggle at the right, as on every page.

## Click map

| Element | Action | Route and state | Back returns to |
|---|---|---|---|
| View switch | Show Month or Year; widens the board | `/accounts` or `/accounts/year`, drops `scope` | The previous view |
| Year stepper (Month) | Step or pick a year | `month`: the same calendar month in that year, else its latest tracked month | The previous year |
| Span picker (Year) | Reach back 5, 10, 20, 50 years or all; a picked year outside is dropped | `span` | The previous span |
| You vs the market, Change by asset type (Month) | Narrow to that month; again widens | `month`, `scope=month` | The previous scope |
| You vs the market, Change by asset type (Year) | Narrow to that year; again widens | `month`: the same calendar month in that year, else its latest; `scope=year` | The previous scope |
| Log balances: date, fields, Save | Log the month's snapshot in place, as on Home (D12). Each field ghosts where the reading date stood: that date's snapshot, else the latest before it, else nothing once past the account's last snapshot | none | |
| Where the money sits, an account's bar (Year) | Open Month at the latest month, scrolled to Log balances with that account's row marked and its field focused | `/accounts`, `month`, `account` | This view |
| KPI cards, stat matrices, lines, stacked areas, Where the money sits, tables | Not clickable; hover explains, as today | | |
| Edit | Arrange the board (D14) | none | |

## Period and URL state

| Param | Values | Absent or invalid |
|---|---|---|
| `month` | `YYYY-MM`, shared (D4) | The latest tracked month |
| Path `/accounts/year` | The Year view; kept on reload (D27) | `/accounts` is Month |
| `scope` | `month` on Month, `year` on Year | The board's whole span: the focus year on Month, the window on Year |
| `span` | `5`, `20`, `50`, `all` (Year) | `10` (D25) |
| `account` | A ledger account (Month) | No row marked; an account not in the month's roster is ignored |

The stepper offers every year holding a tracked month or the one after the latest, so a new month can be logged before anything else is. A month with no bar is reached by the year stepper and the Log balances date. The Month board reads its year from `month`; a year with no snapshot shows the board's empty state above Log balances, which still works. Leaving the page keeps its picks (D21); a reload keeps the view and drops the rest (D26, D27).

## Build steps

1. **The page (built).** Both boards with every carried pane, the view path and its matcher, `month`, and Log balances on Month. Net Worth's `Pref`s (`networth-range`, `networth-year`) go, and so do `BalanceForm` and the modal's balance kind. The Month and Year switch and the view matcher are shared with Analytics (`lib/nav/ViewSwitch.svelte`, `lib/nav/views.ts`).
2. **Picks and time frame (Month built).** Month is Analytics' year stepper and bar picks, shared through `lib/nav/picks.ts`. Still to build: Year's picks and `span`. Bars take `onpick` and `picked`, lines and areas take `mark`, KPI cards narrow, and `span` scopes the Year board. Net worth series take the window (`since`) and keep gap years, as the cash-flow series did for Analytics.
3. **Account drill-in (built).** Where the money sits opens Log balances at the account.

Each step is dogfooded before the next.

## New UI strings

- `Accounts`: the page title, was `Net Worth`.
- `Month`, `Year`: the view switch; `Accounts time range` is its accessible name, was `Net worth time range`.
- Titles and captions under a window name its years, as on Analytics.

## Tests

Accounts joins `BOARD_PAGES`, so `charts` and `steady` cover its Month board, and `arrange` runs its random gestures on it as it did on Net Worth. A new `accounts.spec.ts` covers narrowing and widening on both views, the view switch, the span, logging a month from the checklist with the ledger checks, and the account drill-in. `planning` and `slider` still wait for Planning.

## Decisions (2026-09-25)

1. **Logging:** Log balances only; no `+ Log balance` button.
2. ~~Month picker.~~ Reversed on review: Month takes Analytics' year stepper, and a month's bars pick the month Log balances logs, as Analytics does.
3. **Financial progress and Years of freedom** move to Planning.
4. **Savings rate** stays on the Month board for now, despite D3; revisit after dogfooding.
5. **Where the money sits** opens Log balances at that account. Like a heatmap, it leaves its view, since it reads today's balances rather than a period.
6. **Snapshot tables are heatmaps**, with the columns' own good and bad shading on their tiles.
7. **Log balances ghosts the reading date** (see the click map), from `standing` on `/api/networth`.
8. **Every wash takes the deep hue in light mode** (D29).

## Out of scope

A month's rows (Transactions), cash-flow trends (Analytics), projections (Planning), per-account history (needs an API series), and any chart or copy change (D6).

## Open questions

- **Header while narrowed.** The same question Analytics left open: only captions and marks say a period is picked.

## Dogfood checklist

- Log a real month end from the checklist; every check agrees, then the KPI cards, Monthly snapshots and You vs the market show it.
- Pick a month, read its bridge, pick it again; the year returns.
- Step to an older month and correct one balance.
- On Year, pick a year from either bar chart; every year axis marks it. Try each span.
- Reload any view; the view stays and the picks go.

## Dogfood notes
