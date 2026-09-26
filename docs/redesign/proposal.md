# Proposal

Approved by the user on 2026-09-24 as the overall direction. Page-level behavior is decided per spec, not here.

## Problem

Home, Activity and Net Worth each hold their own Month, Year and All time boards with their own remembered period. Logging on Home and then checking the result means visiting Activity · Month for the list and Activity · Year for the category heatmap, then stepping the month by hand when an outlier shows up. The views are split by time range; the work is not.

The user's habits come from two spreadsheets:

- **Spendings / Earnings tracker.** One sheet per month (transaction rows with a category, an EARNING block, category totals, a checksum), one SUMMARY sheet per year (month × category table, income, spending and savings by month), and an OVERVIEW sheet (year × category).
- **Net Worth tracker.** One row per month with every account's balance, totals for assets, liabilities and net worth, and month-over-month differences.

The two were kept apart. Combining them is new ground, and the best workflow for it is still to be found by dogfooding.

## Two workflows

1. **Logging and verifying.** While entering data, see immediately whether it is right: not only in the transaction list, but in the figures that would reveal an odd amount or a wrong category.
2. **Analyzing.** Read trends across months and years, and drop into the month behind an outlier.

## Pages

| Page | Job | Replaces | Spreadsheet analogue |
|---|---|---|---|
| Dashboard | Where do I stand, and what needs attention | Home's figure strip | none |
| Transactions | Log and verify a month | Home calendar, Activity · Month lists | Month sheet |
| Analytics (D15) | Read spending and income trends | Activity · Year, Activity · All time | SUMMARY and OVERVIEW sheets |
| Accounts | Log balances and read net worth | Net Worth · Year and All time, Home balance checklist | Net Worth tracker |
| Planning | Project forward | Planning inside Net Worth · All time | none |
| Manage | Accounts, categories, employers, options | Manage | none |

Navigation is a left sidebar; each page offers the entries its context logs (D12).

## Principles

1. **Select a period, don't switch to it.** Charts show the context around a focus period; clicking a bar, cell or point moves it. (Each view now keeps its own period: D33.)
2. **Every figure opens its transactions.** A drill-down lands on the rows that make up the number, and back returns to where you were.
3. **Check your work where you log it.** The logging surface shows enough context to catch a mistake at save time.
4. **Net worth explains itself.** A month's net worth change splits into what was saved (from cash flow) and markets and other movement. This is the bridge between the two spreadsheets.
5. **One owner per figure.** See [decisions.md](decisions.md).

## Unchanged

The `data.json` contract, the chart components and catalog, the entry forms, and card reconciliation all carry over. The redesign regroups them.
