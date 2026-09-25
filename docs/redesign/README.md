# Redesign

Yala is being reorganized from tabbed Month / Year / All time boards into Monarch-style pages that share one focus period. This folder is the handoff point: any agent or session picking up the work starts here.

## Read first

0. [HANDOFF.md](HANDOFF.md): where things stand and what is next.
1. [proposal.md](proposal.md): the approved structure and principles.
2. [decisions.md](decisions.md): what is settled and what is still open. Do not re-open a settled decision without the user.
3. The spec for the page you are working on, under [specs/](specs/). New specs start from [specs/_template.md](specs/_template.md).
4. [mocks/prototype.html](mocks/prototype.html): the clickable sample-data prototype. Open it in a browser. It illustrates the direction; it is not a spec, it repeats figures across pages that the specs must resolve, and its charts are not a reference: the current charts and copy carry over (D6).
5. [mocks/](mocks/): clickable mocks made for specific decisions. Open them in a browser.

## How the work proceeds

One page at a time, slowly. For each page:

1. **Spec.** On the page's own branch off `redesign/main` (see Branches), write the page's job, the figures it owns, and a click map: every clickable element and where it routes. Review it with the user before any code.
2. **Build.** On the same branch, against a throwaway ledger (see below).
3. **Dogfood.** The user logs and reviews real months with it and records friction in the spec's dogfood notes.
4. **Revise.** Fold the findings into the spec and decisions, then merge once the user says it is good, and move to the next page.

A figure has one owning page. Anywhere else it appears only as a headline that links to its owner, never as a second full copy.

## Building notes

- Every chart, title and caption carries over (D6). Mock anything new or anything the user cannot picture, publish the mock, keep a copy in `mocks/`, and list every new UI string for review.
- Never read and write the same state in an `$effect`: it loops until Svelte's guard stops it, costing CPU with nothing on screen. The browser tests fail on any uncaught page error, which is what catches it.
- Chart marks are SVG (`lib/charts/marks`).
- A page's view is a path and a pick is a query parameter (D27): a reload keeps the first and drops the second. Decide which a new setting is by where it lives.
- Each worktree needs its own `npm install` in `apps/web`; the primary checkout has none.

## Branches

- `redesign/main` is the integration branch, checked out at `.worktrees/redesign`. It holds these docs and every finished piece of the redesign. It merges to `master` once, when the redesign is complete.
- Each page or feature gets its own branch and worktree off `redesign/main`:

  ```bash
  git -C .worktrees/redesign worktree add ../redesign-<topic> -b redesign/<topic>
  ```

  The spec is written on this branch too. Merge back only after the user says the work is good, rebasing onto `redesign/main` first so history stays linear. Remove the worktree and branch afterwards.
- Doc-only changes outside a page's work, such as a decision recorded between pages, may be committed straight to `redesign/main`.

## Running against real data

Never point a development build at `yala-private-data/ledger`. Make a throwaway worktree of the data repo, install the web dependencies in the feature worktree (the primary checkout has none to link), and serve the feature worktree from the primary checkout on a port that is not the container's `8001`:

```bash
git -C ../yala-private-data worktree add --detach .worktrees/<topic>
npm --prefix .worktrees/redesign-<topic>/apps/web install
YALA_WEB_DIR=$PWD/.worktrees/redesign-<topic>/apps/web/build \
  make serve-api PORT=8800 WORKTREE=$PWD/.worktrees/redesign-<topic> \
  LEDGER=$PWD/../yala-private-data/.worktrees/<topic>/ledger
```

`YALA_WEB_DIR` is needed because the API otherwise serves the primary checkout's build. Remove the data worktree when the branch merges.

## Status

| Piece | Spec | Build | Dogfood |
|---|---|---|---|
| App shell (sidebar, routes, URL state) | [done](specs/app-shell.md) | merged | partial: month history waits for a page with a period |
| Transactions | [done](specs/transactions.md) | merged | reviewed on 8800; keep logging real months |
| Analytics (was Cash flow) | [done](specs/analytics.md) | built on `redesign/analytics` | not started |
| Accounts | not started | not started | not started |
| Dashboard | not started | not started | not started |
| Planning (moved) | not started | not started | not started |
| Manage (moved) | not needed | moved in with the shell | not started |
