// The account directory: display name and institution for every account the ledger declares.
//
// Both are resolved in Python (see `yala.ledger.naming`) and shipped in `data.json` under
// `meta.accounts`, so the naming rule has exactly one implementation instead of one per language.
// This module is the frontend's read side of it.
//
// It is a module-level registry rather than a store because `formatAccount` and `accountVar` are
// pure helpers called from ~15 components, chart specs, and sort comparators. Threading the
// directory through all of them as a prop would be a large change for a lookup that is global by
// nature — the ledger has one set of account names at a time.
//
// The registry has to be `$state`, and this file therefore has to be `.svelte.ts`: reading a plain
// module variable inside a function called from markup creates no dependency, so a row rendered
// before the directory arrived would keep its fallback name until something unrelated invalidated
// it. That is not hypothetical — it showed up as a newly added account displaying its raw leaf
// until the page was reloaded.

import type { AccountInfo } from '$lib/data/types';

let directory = $state<Record<string, AccountInfo>>({});

/** Replace the directory. Called whenever a `DashboardData` document is loaded. */
export function setAccountDirectory(accounts: Record<string, AccountInfo> | undefined): void {
	directory = accounts ?? {};
}

/** What the ledger says about `account`, or undefined when it isn't declared. */
export function accountInfo(account: string | null | undefined): AccountInfo | undefined {
	return account ? directory[account] : undefined;
}
