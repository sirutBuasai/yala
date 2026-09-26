# App shell spec

Status: merged

## Job

Move between pages without losing your place. The shell returns each view as it was left (D33) and makes browser back and forward undo each step (D9). Adding entries is each page's job (D12). It starts every page from a clean slate: the old tabbed views are removed rather than mounted under the new routes, and each page is rebuilt on its own branch.

## Owns

The shell owns no figures. It owns:

| Thing | Today | In the shell |
|---|---|---|
| Which page is showing | `tab` in localStorage, one route | One route per page |
| Focus period | Four separate keys: `home-month`, `activity-month`, `activity-year`, `networth-year` | `month` in each view's URL (D33) |
| Range within a page | `activity-range`, `networth-range` in localStorage | `view` in the URL |
| Chosen calendar day | `calendar-day` in localStorage | `day` in the URL |
| Scroll position | `scroll` in localStorage, restored by hand per tab | Each view's own, in session storage (D22, D33); the router's restore on back and forward |
| Loading and read-only notices | `+page.svelte` | `+layout.svelte`, so data loads once and survives navigation |

Preferences stay in localStorage, since they are about you rather than about the view: theme, board arrangements, transaction sort, and the last-used form values (`last-category` and the rest).

## Layout

- **Sidebar**, left, full height:
  - The brand and today's header caption, unchanged (live or snapshot, transaction count, year span).
  - Page links in this order: Dashboard, Transactions, Analytics, Accounts, Planning, Manage.
  - At the bottom: the Development link.
- **Page area**: each page's `ViewHeader` (title, the page's own controls, and the theme toggle at the far right, as in the old top bar), then its content.
- **Every page, Development included, sits inside the shell**, so the sidebar never changes shape between pages.
- **Banners**: loading, error and read-only mode, above the page area, unchanged.
- **Narrow screens**: the sidebar collapses into the existing hamburger sheet (`NavMenu`). The phone layout itself is an open decision.

## Routes

| Route | Sidebar item | Content now |
|---|---|---|
| `/` | Dashboard | "This page is being rebuilt." |
| `/transactions` | Transactions | Built |
| `/analytics`, `/analytics/year` | Analytics | Built |
| `/accounts`, `/accounts/year` | Accounts | Built |
| `/planning` | Planning | "This page is being rebuilt." |
| `/manage` | Manage | The current Manage view, unchanged |
| `/dev` | Development | The token gallery, inside the shell |

The Home, Activity and Net Worth views were deleted; their reusable components stay. When a page is built, recover what it carries over (D6) from `master`, for example `git show master:apps/web/src/lib/views/networth/Planning.svelte`, and restore the e2e suites that cover it (`planning` and `slider` still wait for Planning).

## URL state

| Param | Values | Used by | Absent or invalid |
|---|---|---|---|
| `month` | `YYYY-MM` | Every page with a period | The latest tracked month; an invalid value is replaced in place, not reported |
| Path segment | Page-defined, e.g. `/analytics/year` | Pages with more than one view | The page's default view; since D27 a view is a path, not a `view` parameter |
| `day` | `YYYY-MM-DD` | The calendar | No day chosen |
| `entry` | An entry locator | Any list with an open editor | Nothing open |

Page filters (category, account, type, pending, search) are named by each page's spec but follow the same rules.

**One parameter, two grains.** There is no `year` parameter: a year-level view reads its year from `month`. Stepping a year from 2026 to 2024 moves to the same calendar month in 2024, clamped to the tracked range.

**Each view keeps its own (D33).** A sidebar link or view switch reopens each view with its own URL state and scroll as last left in this tab (`lib/nav/left.ts`); nothing carries from one view to another. A drill-in names its own month and filters, and lands on its pane (D34, `lib/nav/drill.ts`). A reload keeps the view and drops every view's picks (D26, D27).

**History.** Every deliberate step adds a history entry: changing page, stepping the period, choosing a range, applying a filter, opening or closing an entry. Typing in a search box replaces the current entry instead, so back does not replay each keystroke.

## Click map

| Element | Action | Route and state | Back returns to |
|---|---|---|---|
| Brand | Go to Dashboard | `/` as it was left | The previous page |
| Page link | Go to that page | Its view as it was left, with that view's URL and scroll (D33) | The previous page, at its scroll position |
| Period stepper | Step the period | Same route, new `month` | The previous period |
| View switch | Show the other view | That view's path as it was left (D33) | The previous view |
| Theme toggle | Switch theme | Unchanged | Not applicable |
| Development | Open the token gallery | `/dev` | The previous page |

## Implementation notes

- `routes/(app)/+layout.svelte` holds loading, the banners and the sidebar. Every route, `/dev` included, lives in the `(app)` group.
- The theme toggle lives in `ViewHeader`, so every page shows it on its title line.
- `lib/nav/pages.ts` is the one list of pages; the sidebar and the hamburger sheet both render it through `NavLinks`, whose links reopen each page as it was left (`lib/nav/left.ts`).
- The sidebar docks while the page beside it stays wider than a one-column board (`lib/nav/sidebar.ts`); otherwise it folds into the hamburger sheet.
- Page and view switches restore scroll through `restoreScroll`, which waits for the board to grow tall enough; back and forward use the router's own restore.
- The site is prerendered with `ssr = false`, so query params may only be read in the browser.
- The API already serves `200.html` for unknown paths, so deep links work behind `make serve-api` and the container. Check `make serve` (the preview server) too.
- The old localStorage keys listed above are no longer read. They are left in place rather than deleted.
- Until `master` has `redesign/accounts`' `scripts/_common.py` fix, see the README for serving a branch's API changes.

## Out of scope

Page content, charts and copy (D6), the Dashboard itself, the phone layout, and the Planning page.

## Resolved

- **Transitional routes (2026-09-24).** Clean slate: new pages only, no old views mounted under them, so no migration code to remove later.
- **Period steps in history (2026-09-24).** Each step adds a history entry for now; revisit after dogfooding.

## Open questions

None; board width beside the sidebar was settled by D13.

## Dogfood checklist

- Switch pages and views repeatedly; each returns as it was left.
- Drill in, then press back; you return to the same place and scroll.
- Reload any page; the view is identical.
- Open a deep link in a new tab, under `make serve-api` and in the container.
- Read-only mode still shows its banner and refuses saves.

## Dogfood notes

- 2026-09-24: Reviewed on port 8800 against real data. Sidebar, page links, the Development page and the theme toggle checked.
- 2026-09-25: Page state reworked through dogfooding Analytics and Accounts, ending at D33 and D34.
