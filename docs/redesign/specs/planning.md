# Planning spec

Status: built, dogfooding · Branch: `redesign/planning`

## Job

Project forward: "what if". State the assumptions the ledger cannot derive (withdrawal rate, return, inflation, ages, runway, planned spending and investing), see at once what they imply for financial independence, and save them. The prototype gave it its own page because it answers "what if", not "what happened"; it drew no page for it, so everything here comes from `master`.

The page reads now, as Dashboard does: every figure starts from the latest snapshot and the trailing twelve months. It has no stepper, no view switch and no picks.

## Revised (2026-09-27)

After dogfooding, the user chose a hybrid of three layouts in [mocks/planning-layouts.html](../mocks/planning-layouts.html) (D59): a summary sentence over a milestone timeline, Financial progress as rings, the projection full width, and the assumptions in three panes as typed figures with Default beside each hint (D60). The tables below describe the page as built now; the Decisions section records how it got here.

## Carries over (D6)

Sources on `master`: `lib/views/networth/AllTimeView.svelte` (the Financial progress pane, its Adjust button and the Years of freedom KPI), `Planning.svelte` (the planning panel) and `copy.ts`. The builders (`projection.ts`, the targets in `networth.ts`, `assumptions.ts`), `Slider` and the settings API are already on `redesign/main`, unchanged from `master`.

| Pane | Title · caption | Was |
|---|---|---|
| Milestones | No title: `You reach FI in <year>, at <age>, with success rate of <N>%.`, captioned `<N>% of simulated runs result in lasting balance after the age of <age>.` with a `?` explaining it; Today, Coast FI, FI, Retire and the horizon age on one timeline with each one's balance, the rail coloured by phase; then four counts (D59, D63) | New; the FI date (D55) is its year |
| Rings | Financial progress · `key metrics for financial independence`: Cash runway, FI number, Coast FI, each a ring with its figures under it | Net Worth · All time's bullets, drawn as rings here (Dashboard keeps the bullets) |
| Line | Projected investments · `invested balance growth and financial independence projection`, with `Depletion year: <year> at $X/yr · <N>% of 1,000 simulated markets last to <age>. ...` under it. **Adds** the middle 80% of simulated markets as a band behind Investing (D56) | The panel's right column |
| Typed figures | Market (withdrawal rate, nominal return, inflation, volatility), Timeline (birth year, retirement age, horizon age), Spending and saving (planned spending, out-of-pocket investing, cash runway target) | The planning panel's controls, in its modal |

Every control keeps its label, bounds and hint with the worked arithmetic; each former footnote closes its hint. Each figure is typed into a field held to its bounds, stepped by the arrow keys (a tenth of a percent, $500, a year or a month), and dragged along a slider under it, which redraws every pane as it moves (D61). `Default` sits right after each hint's `?`. Birth year is the same field without a slider, which may be left empty to unset it, and has no Default. The summary keeps to one line, its type scaled to the pane's width (`scaleToFit`), and wraps only where even the smallest readable size is too wide, as on a phone. The timeline scales with its pane (`content: 'scale'`): the rail runs the width, and the height the labels leave thickens the rail and its dots (`railLayout`); the labels' rows are its floor. It clips its own drawing, so a resize never reads positions from the last size as a spill. Financial progress opens at its floor, 12 by 9, found by resizing in Edit. Projected investments' hover reads every line's balance under the year and the age you are that year (`2050 · age 60`), from the birth year. Its axis, decades long, names every fifth year where every year would crowd (D54). Projected investments keeps its frame fixed at the largest FI number the withdrawal setting can ask for (`ceiling`), so moving it moves the target line within the plot rather than rescaling it.

Not carried: the Adjust button and the modal around the panel (decision 1). Nothing from the prototype.

## Owns (D3)

| Figure | Owned here? | If not, owner and link |
|---|---|---|
| The planning assumptions (the `yala-setting` directives) | Yes | Edited nowhere else |
| Financial progress: Cash runway, FI progress, Coast FI | Yes | Dashboard headlines it; its title opens `/planning` (D44, D48) |
| FI date, market risk | Yes | |
| Projected investments and the depletion year | Yes | |
| Invested balance and liquid cash, the projection's start | No | Accounts. Read only inside the hints' arithmetic; no link |
| Trailing spending, saved and contributions, the rates' seeds | No | Analytics. Read only inside the hints' arithmetic; no link |

## Layout

One board, arrangeable (D14), stored under `planning`. The default is the user's own arrangement (D51), taken from their stored board on 2026-09-27:

- Financial progress at the top left, the timeline beside it, both at their floors.
- Projected investments full width.
- Timeline, Market, and Spending and saving side by side under it, with Save changes under Spending and saving.

The header: `Planning`, then Edit and the theme toggle. Save changes and Discard, with the save's outcome, sit in a pane of their own, so the board can place them.

### Previewing and saving

Every control moves the preview only: the summary, the milestones, Financial progress, Projected investments, the depletion line and the market-risk band all redraw from the draft. The draft is stated over the ledger's settings (`withSettings`), so every pane reads it through the same builders Dashboard does. Nothing reaches the ledger until Save changes; then the data is re-pulled, so Dashboard's headline agrees. Save changes and Discard are enabled only while a control differs from the ledger. A save reads `Saved.` beside the buttons, which grey out until the next change clears it. Discard returns every control to what the ledger states.

A draft is page state, not a pick: it is not in the URL, and leaving the page or reloading drops it, as an unsaved Log balances does (decision 3).

Without the API (a read-only snapshot) the controls load from the settings and specs `data.json` carries, and every preview works; Save is refused by the write guard. A snapshot too old to carry the specs shows the panel's error and `Try again`.

## Click map

| Element | Action | Route and state | Back returns to |
|---|---|---|---|
| A figure, Birth year | Change the draft; every other pane redraws | none | |
| A figure's `Default` | Set it to the backend default | none | |
| A control's hint, the summary's `?` | Open its explanation and worked arithmetic | none | |
| Save changes | Write each changed setting, then re-pull the data | none | |
| Discard | Return every control to the ledger's values | none | |
| Projected investments, a year | Nothing: hover reads each line's balance and the age that year (decision 2) | | |
| Financial progress, a ring | Nothing: hover reads its note | | |
| Milestones | Nothing | | |
| Edit | Arrange the board (D14) | none | |

Nothing on the page opens another page. The one way in besides the sidebar is Dashboard's Financial progress title (D48).

## Period and URL state

None: the page reads now, so its URL is `/planning`. The scroll is kept per view (D33).

## Build steps

1. **Mock (approved).** [mocks/planning-page.html](../mocks/planning-page.html), beside how master works.
2. **The page (built).** `lib/views/planning/`: `Planning.svelte` (the board), `Assumptions.svelte` (the panel's body as a pane) and `draft.svelte.ts` (the draft, its load, preview and save). The route replaces `Rebuilding`, which is gone. `Slider` lost its `footer` slot, since Default now rides in its hint.
3. **Hover ages (built).** A multi-series may carry `notes`, one per point, which a line chart's hover adds after the point's label; the projection notes each year's age.
4. **Tests (built).** `planning` and `slider` restored from `master`, opening `/planning` instead of Adjust; Planning joins `BOARD_PAGES`.
5. **Market risk and the FI date (built, D55, D56).** `marketRisk` runs the investing line in 1,000 seeded markets; `fiDate` reads the projection. Return volatility joins the settings (API, contract, fixture).
6. **The hybrid (built, D59).** `MilestonesPane` and `Milestones` (labels placed by `placeLabels`, which moves crowding labels to further rows), `RingChart` (the bullet set as rings, beside `BulletChart`), `AssumptionGroup` and `NumberField` (which replaced `Slider`; its spec is `number-field.spec.ts`). The FI date KPI card is gone; its year leads the summary.

## New UI strings

- `You reach FI in <year>, at <age>, with success rate of <N>%.`, `You're past FI already, ...`, `At this rate, you don't reach FI before <age>.`, `Set your birth year in Timeline to see when you reach FI.`; the success-rate hint in the user's words.
- `Today`, `Coast FI`, `FI`, `Retire`, `Age <N>`: the milestones, each with its balance.
- `Building`, `Optional coast`, `Optional work`, `Drawing down`: the phases between them.
- `<N>% of simulated runs result in lasting balance after the age of <age>.`: the pane's caption.
- `<N> yr` `to FI`, `<N> yr` `to retirement`, `<$X>` `at retirement`, `spend <$X>/mo` `less for FI in <year>`, `invest <$X>/mo` `more for FI in <year>`: the counts; the last two are the levers (D65).
- `You're retired, with success rate of <N>%.`: the summary once the retirement age has passed.
- `Market`, `Timeline`, `Spending and saving` and their captions.
- `reached FI by <year>`, `doesn't reach FI at this rate`: Coast FI's note, the year today's invested balance alone, with no more contributions, reaches the FI number (`coastYear`): before retirement exactly when Coast FI is past 100%. Was `<$X> today reaches FI by <retirement year>`.
- `set your birth year in Planning`: Coast FI's note, was `... in Financial planning`, a pane that is gone.
- `FI date`; `at <age>, when investing reaches the <$X> FI number`, `investing is already past the <$X> FI number`, `not reached by <age> at this rate`.
- `Return volatility` and its help; `Middle 80% of markets`; `<N>% of 1,000 simulated markets last to <age>.` with `In the worst tenth, the balance runs out by <year>.` or `Even the worst tenth lasts.`
- `<$X> today reaches FI by <year>`: Coast FI's note, was `<$X> needed <N> yr out`, which read as a sum due in that year. It is the balance that, left alone from today, compounds into the FI number by the retirement year.
- `age <N>`: the projection hover's heading, after the year.
- `Saved.` beside Save changes, the shared confirmation (`SAVED`), new to this surface.

`Planning` is already the sidebar's label; every other string carries over.

## Tests

Planning joins `BOARD_PAGES`, so `charts`, `steady` and `arrange` cover it. `planning.spec.ts` checks that a figure redraws the projection and the rings, Save and Discard enabled only after a change, Discard restoring the ledger's values, the draft dropped on leaving, the hover's ages, the market-risk line, Default beside the hint, the summary over its milestones, and the summary keeping to one line. A save needs the API, so the suite, which runs read-only, does not write. `number-field.spec.ts` keeps the slider's bounds, separator and rejected-entry checks, and adds the arrow keys. `withSettings`, `notes`, `marketRisk`, `fiDate`, `milestones` and `placeLabels` have unit tests. Accessibility runs on the page.

## Decisions (2026-09-26)

The user approved every recommendation below from the mock, and asked for the hover's ages, Default beside the hint, and a `Saved.` confirmation.

1. **Assumptions in a pane, not a modal.** Recommended: the panel's controls become the Financial planning pane, beside the charts they move, and Adjust goes. The modal existed because the assumptions lived on a Net Worth board; here they are the page's reason to exist, as Log balances is Accounts'. D16 does not apply: it governs rows. The alternative keeps the board read-only with Adjust opening the same modal, which hides the page's main content behind a button.
2. **The projection does not pick.** Recommended: an exception to D39, as the KPI underlays are. Its axis is future years, and no other pane reads a period to narrow to.
3. **An unsaved draft is dropped on leaving.** Recommended, as Log balances drops its fields. The alternative keeps the draft for the tab, which would leave Planning previewing figures that Dashboard's headline does not show.
4. ~~**Years of freedom as it is.**~~ Removed on dogfooding for the FI date (D55). Was recommended (D6). It reads net worth over logged spending, while FI number and Coast FI read the invested balance over planned spending, so a Planned spending change moves the bullets but not its figure. Aligning it would be a figure change, shown as a mock beside the current one if you want it.

## Out of scope

Logging (Accounts, Transactions), what happened (Analytics, Accounts), a history of past assumptions (the directives keep it; nothing reads it), and any chart or copy change (D6).

## Open questions

- **A visible "unsaved" state.** Only the enabled Save changes says the preview differs from the ledger. Add a mark on the preview panes if dogfooding shows it is missed.
- **The default layout.** Proposed here, not yet the user's; once arranged, the stored arrangement becomes it (D51).
- **Phone layout** (Open, in decisions).

## Dogfood checklist

- Open Planning from Dashboard's Financial progress title; back returns to Dashboard.
- Read the summary's `?`; its figures match the settings.
- Step each assumption; the summary, milestones, rings and projection follow, and the plot does not rescale while moving the withdrawal rate.
- Lower the retirement age until milestones crowd; no two labels overlap.
- Hover the projection; each year reads every line's balance and your age.
- Save one change; Dashboard's Financial progress agrees. Discard another; the controls return.
- Leave with an unsaved change and come back; the ledger's values show.
- Arrange the board; reload; the arrangement stays.

## Dogfood notes
