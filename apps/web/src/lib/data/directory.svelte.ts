// `$state`, since a plain module variable read from markup creates no dependency: a new account showed its
// raw leaf until reload.

import type { AccountInfo } from '$lib/data/types';

let directory = $state<Record<string, AccountInfo>>({});

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
