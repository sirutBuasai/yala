# Handoff

Where the redesign stands, for the next session. Update this before a session ends.

## State (2026-09-25)

- `redesign/main` (worktree `.worktrees/redesign`) holds the app shell and the finished Transactions page. Nothing is pushed.
- Done: app shell (sidebar with icon rail, routes, focus month in the URL) and Transactions. Manage moved in unchanged.
- Placeholders ("This page is being rebuilt."): Dashboard, Analytics, Accounts, Planning.
- Next: the **Analytics** spec (the old Activity · Year and All time). Then Accounts, Dashboard, Planning.

## How the user works

- Spec first, reviewed before code; one page per `redesign/<topic>` branch off `redesign/main`.
- Anything visual they cannot picture gets a clickable mock (published as an Artifact and saved under `mocks/`) before building.
- Current charts, titles and captions carry over (D6); an improvement is mocked beside the current one. List every new UI string for their review.
- They review on port 8800 against a throwaway ledger while production runs on 8001 (serve command in README). Their arranged layout, pasted from localStorage, becomes the page default (D14).
- Their global instructions ask for short answers and no low-value comments; follow them.

## Lessons from this round

- **Never read and write the same state in an `$effect`.** A board counter doing `env.boards++` in an effect looped until Svelte's guard stopped it: invisible on screen, but it cost 40ms per pointer move and pegged the CPU. The browser tests now fail on any uncaught page error (`e2e/app.ts`), which is what catches this.
- Profile before guessing: `Performance.getMetrics` and `Profiler` over CDP with Playwright's Chromium, against an unminified build (`npx vite build --minify false`). Playwright's Firefox does not launch on this machine.
- Every chart mark is SVG (`lib/charts/marks`); Category by month stays an HTML table because it is one.
- The main checkout has no `node_modules`; run `npm install` in each worktree's `apps/web`.

## Loose ends

- A port-8800 server may still be running from the last session, on the throwaway ledger `yala-private-data/.worktrees/redesign-main`. Stop it and remove that worktree once the user is done.
- Open questions: see the Open list in [decisions.md](decisions.md).
