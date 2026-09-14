// Every account the ledger declares, as the backend resolved it, shipped under `meta.accounts`.
//
// Must be `$state` (hence `.svelte.ts`): a plain module variable read inside a function called from
// markup creates no dependency, so a newly added account showed its raw leaf name until reload.

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

/** Every declared account, closed ones included — what a reopen has to choose from. */
export function accountDirectory(): [string, AccountInfo][] {
	return Object.entries(directory);
}
