# App shell spec

Status: built, in review · Branch: `redesign/app-shell`

## Job

Move between pages without losing your place. The shell carries the focus period from page to page (D4), makes browser back and forward undo each step (D9), and gives every page the same way to add an entry. It starts every page from a clean slate: the old tabbed views are removed rather than mounted under the new routes, and each page is rebuilt on its own branch.

## Owns

The shell owns no figures. It owns:

| Thing | Today | In the shell |
|---|---|---|
| Which page is showing | `tab` in localStorage, one route | One route per page |
| Focus period | Four separate keys: `home-month`, `activity-month`, `activity-year`, `networth-year` | One focus month in the URL |
| Range within a page | `activity-range`, `networth-range` in localStorage | `view` in the URL |
| Chosen calendar day | `calendar-day` in localStorage | `day` in the URL |
| Scroll position | `scroll` in localStorage, restored by hand per tab | The router's own restore on back and forward |
| Adding an entry | An Add entry modal per view | One Add entry modal owned by the shell |
| Loading and read-only notices | `+page.svelte` | `+layout.svelte`, so data loads once and survives navigation |

Preferences stay in localStorage, since they are about you rather than about the view: theme, board arrangements, transaction sort, and the last-used form values (`last-category` and the rest).

## Layout

- **Sidebar**, left, full height:
  - The brand and today's header caption, unchanged (live or snapshot, transaction count, year span).
  - `+ Add entry`, opening the current Add entry modal with its four kinds.
  - Page links in this order: Dashboard, Transactions, Cash flow, Accounts, Planning, Manage.
  - At the bottom: the arrange toggle, the theme toggle, and the Development link that today sits in the hamburger menu.
- **Page area**: each page's `ViewHeader` (title plus its period control), then its content, as today.
- **Banners**: loading, error and read-only mode, above the page area, unchanged.
- **Narrow screens**: the sidebar collapses into the existing hamburger sheet (`NavMenu`). The phone layout itself is an open decision.

## Routes

| Route | Sidebar item | Content now |
|---|---|---|
| `/` | Dashboard | "This page is being rebuilt." |
| `/transactions` | Transactions | Same |
| `/cash-flow` | Cash flow | Same |
| `/accounts` | Accounts | Same |
| `/planning` | Planning | Same |
| `/manage` | Manage | The current Manage view, unchanged |
| `/dev` | Development | The token gallery, outside the shell |

The Home, Activity and Net Worth views were deleted, with the e2e suites that drove their boards: `arrange`, `charts`, `planning`, `slider` and `steady`. The reusable components they composed (KPI cards, charts, calendar, lists, balance checklist) stay. When a page is built, recover what it carries over (D6) from `master`, for example `git show master:apps/web/src/lib/views/activity/YearView.svelte`, and restore the e2e suites that cover it.

## URL state

| Param | Values | Used by | Absent or invalid |
|---|---|---|---|
| `month` | `YYYY-MM` | Every page with a period | The latest tracked month; an invalid value is replaced in place, not reported |
| `view` | Page-defined, e.g. `month`, `year`, `all` | Pages with more than one range | The page's default |
| `day` | `YYYY-MM-DD` | The calendar | No day chosen |
| `entry` | An entry locator | Any list with an open editor | Nothing open |

Page filters (category, account, type, pending, search) are named by each page's spec but follow the same rules.

**One focus, two grains (D4).** There is no `year` parameter: a year-level view reads its year from `month`. Stepping a year view from 2026 to 2024 moves the focus to the same calendar month in 2024, clamped to the tracked range. Going back to a month-level page then lands on that month.

**Carrying it over.** Sidebar links and every drill-down are built from the current focus, so `/transactions` opened from Cash flow keeps the month or year you were on.

**History.** Every deliberate step adds a history entry: changing page, stepping the period, choosing a range, applying a filter, opening or closing an entry. Typing in a search box replaces the current entry instead, so back does not replay each keystroke.

## Click map

| Element | Action | Route and state | Back returns to |
|---|---|---|---|
| Brand | Go to Dashboard | `/` with the current focus | The previous page |
| `+ Add entry` | Open the Add entry modal over the current page | Unchanged | Closes nothing; the modal has its own close |
| Page link | Go to that page | `/<page>` with the current focus | The previous page, at its scroll position |
| Period stepper, range switch | Step or switch | Same route, new `month`, `year` or `view` | The previous period or range |
| Arrange toggle, theme toggle, Development | As today | Unchanged | Not applicable |

## Implementation notes

- `routes/(app)/+layout.svelte` holds loading, the banners, the sidebar and the shared Add entry modal. `/dev` sits outside the `(app)` group.
- `lib/nav/pages.ts` is the one list of pages; the sidebar and the hamburger sheet both render it through `NavLinks`, whose links carry the focus month (`lib/nav/focus.ts`).
- The sidebar docks while the page beside it stays wider than a one-column board (`lib/nav/sidebar.ts`); otherwise it folds into the hamburger sheet.
- The arrange toggle is left out until a page has a board again.
- The hand-written scroll restore in `+page.svelte` goes; the router restores scroll on back and forward. Verify this while dogfooding, since async panes grow the page after navigation.
- The site is prerendered with `ssr = false`, so query params may only be read in the browser.
- The API already serves `200.html` for unknown paths, so deep links work behind `make serve-api` and the container. Check `make serve` (the preview server) too.
- The old localStorage keys listed above are no longer read. They are left in place rather than deleted.

## Out of scope

Page content, charts and copy (D6), the Dashboard itself, the phone layout, and the Planning page.

## Resolved

- **Transitional routes (2026-09-24).** Clean slate: new pages only, no old views mounted under them, so no migration code to remove later.
- **Period steps in history (2026-09-24).** Each step adds a history entry for now; revisit after dogfooding.

## Open questions

- **Board width beside the sidebar.** A full 48-column board needs about 1,400px of content. With the sidebar docked, a board only reaches full width, and so only offers arranging, on a very wide window. Decide in the first spec that brings a board back (likely Dashboard).

## Dogfood checklist

- Switch pages repeatedly; the focus month never resets.
- Step a year view, then open a month page; it lands on the matching month.
- Drill in, then press back; you return to the same place and scroll.
- Reload any page; the view is identical.
- Open a deep link in a new tab, under `make serve-api` and in the container.
- Quick add from each page; the page refreshes with the new entry.
- Read-only mode still shows its banner and refuses saves.

## Dogfood notes
