# Redesign

Yala is being reorganized from tabbed Month / Year / All time boards into Monarch-style pages that share one focus period. This folder is the handoff point: any agent or session picking up the work starts here.

## Read first

1. [proposal.md](proposal.md): the approved structure and principles.
2. [decisions.md](decisions.md): what is settled and what is still open. Do not re-open a settled decision without the user.
3. The spec for the page you are working on, under [specs/](specs/). New specs start from [specs/_template.md](specs/_template.md).
4. [prototype.html](prototype.html): the clickable sample-data prototype. Open it in a browser. It illustrates the direction; it is not a spec, and it repeats figures across pages that the specs must resolve.

## How the work proceeds

One page at a time, slowly. For each page:

1. **Spec.** Write the page's job, the figures it owns, and a click map: every clickable element and where it routes. Review it with the user before any code.
2. **Build.** In a feature branch off `redesign/main`, against a throwaway ledger (see below).
3. **Dogfood.** The user logs and reviews real months with it and records friction in the spec's dogfood notes.
4. **Revise.** Fold the findings into the spec and decisions, then merge and move to the next page.

A figure has one owning page. Anywhere else it appears only as a headline that links to its owner, never as a second full copy.

## Branches

- `redesign/main` is the integration branch, checked out at `.worktrees/redesign`. It holds these docs and every finished piece of the redesign. It merges to `master` once, when the redesign is complete.
- Each page or feature gets its own branch and worktree off `redesign/main`:

  ```bash
  git -C .worktrees/redesign worktree add ../redesign-<topic> -b redesign/<topic>
  ```

  Rebase onto `redesign/main` before merging back, so history stays linear. Remove the worktree and branch afterwards.
- Doc-only changes (decisions, specs, dogfood notes) may be committed straight to `redesign/main`.

## Running against real data

Never point a development build at `yala-private-data/ledger`. Make a throwaway worktree of the data repo and pass it with `LEDGER=`:

```bash
git -C ../yala-private-data worktree add --detach .worktrees/<topic>
make serve-api LEDGER=../yala-private-data/.worktrees/<topic>/ledger
```

## Status

| Piece | Spec | Build | Dogfood |
|---|---|---|---|
| App shell (sidebar, routes, URL state) | not started | not started | not started |
| Transactions | not started | not started | not started |
| Cash flow | not started | not started | not started |
| Accounts | not started | not started | not started |
| Dashboard | not started | not started | not started |
| Planning (moved) | not started | not started | not started |
| Manage (moved) | not started | not started | not started |
