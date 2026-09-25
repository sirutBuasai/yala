# App shell spec

Status: draft, awaiting review · Branch: `redesign/app-shell`

## Job

Move between pages without losing your place. The shell carries the focus period from page to page (D4), makes browser back and forward undo each step (D9), and gives every page the same way to add an entry. It changes no page content: the current views are mounted as they are until their own specs replace them.

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

## Routes during the transition

Each route shows the closest current view until its page is built, so the shell can ship and be dogfooded on its own.

| Route | Sidebar item | Shows until its page is built |
|---|---|---|
| `/` | Dashboard | Home |
| `/transactions` | Transactions | Activity, Month range |
| `/cash-flow` | Cash flow | Activity, Year and All time ranges |
| `/accounts` | Accounts | Net Worth |
| `/planning` | Planning | Hidden until the Planning spec; today it is only the Adjust dialog inside Net Worth · All time |
| `/manage` | Manage | Manage |
| `/dev` | Development | Development |

## URL state

| Param | Values | Used by | Absent or invalid |
|---|---|---|---|
| `month` | `YYYY-MM` | Month-level pages | The latest tracked month; an invalid value is replaced in place, not reported |
| `year` | `YYYY` | Year-level views | The focus month's year |
| `view` | Page-defined, e.g. `month`, `year`, `all` | Pages with more than one range | The page's default |
| `day` | `YYYY-MM-DD` | The calendar | No day chosen |
| `entry` | An entry locator | Any list with an open editor | Nothing open |

Page filters (category, account, type, pending, search) are named by each page's spec but follow the same rules.

**One focus, two grains (D4).** The shell holds a single focus month. A year-level view reads its year from it. Stepping a year view from 2026 to 2024 moves the focus to the same calendar month in 2024, clamped to the tracked range. Going back to a month-level page then lands on that month.

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

- `+layout.svelte` takes over loading, the banners, the sidebar and the shared Add entry modal from `+page.svelte`.
- The hand-written scroll restore in `+page.svelte` goes; the router restores scroll on back and forward. Verify this while dogfooding, since async panes grow the page after navigation.
- The site is prerendered with `ssr = false`, so query params may only be read in the browser.
- The API already serves `200.html` for unknown paths, so deep links work behind `make serve-api` and the container. Check `make serve` (the preview server) too.
- The old localStorage keys listed above are no longer read. They are left in place rather than deleted.

## Out of scope

Page content, charts and copy (D6), the Dashboard itself, the phone layout, and the Planning page.

## Open questions

1. **Transitional routes.** The table above names routes after the new pages and mounts old views under them (Dashboard shows Home, for instance). The alternative keeps the old four tabs as sidebar items until each is replaced. Suggested: the new names, so dogfooding tests the new navigation from day one.
2. **Period steps in history.** Should each month step add a history entry, or should a run of steps collapse into one? Suggested: each step, as written, then revisit after dogfooding.

## Dogfood checklist

- Switch pages repeatedly; the focus month never resets.
- Step a year view, then open a month page; it lands on the matching month.
- Drill in, then press back; you return to the same place and scroll.
- Reload any page; the view is identical.
- Open a deep link in a new tab, under `make serve-api` and in the container.
- Quick add from each page; the page refreshes with the new entry.
- Read-only mode still shows its banner and refuses saves.

## Dogfood notes
