// The account directory: display name and institution for every account the ledger declares. Both
// are resolved in Python (see `yala.ledger.naming`) and shipped under `meta.accounts`, so the naming
// rule has one implementation; this module is the frontend's read side of it.
//
// A module-level registry rather than a store: the lookup is global by nature and its pure helpers are
// called from components, chart specs and sort comparators alike. It must still be `$state` (hence
// `.svelte.ts`) — a plain module variable read inside a function called from markup creates no
// dependency, so a newly added account showed its raw leaf name until the page was reloaded.

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
