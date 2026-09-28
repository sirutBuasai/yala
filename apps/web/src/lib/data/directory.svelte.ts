// `$state`, since a plain module variable read from markup creates no dependency: a new account showed its
// raw leaf until reload.

import type { AccountInfo } from '$lib/data/types';

let directory = $state<Record<string, AccountInfo>>({});
/** Category accounts by the category's own name, which is how spending rows name them. */
let categories = $state<Record<string, AccountInfo>>({});

export function setAccountDirectory(accounts: Record<string, AccountInfo> | undefined): void {
	directory = accounts ?? {};
	categories = Object.fromEntries(
		Object.entries(directory)
			.filter(([, info]) => info.kind === 'category')
			.map(([path, info]) => [path.slice(path.indexOf(':') + 1), info])
	);
}

/** Which settings a colour is kept under, as the API keys it. */
export type ColorFamily = 'institutions' | 'categories';
export interface ColorKey {
	family: ColorFamily;
	name: string;
}

/** An account's colour belongs to its institution, else to its category, else to nothing (an employer,
    a deduction). */
export function colorKey(account: string, info: AccountInfo | undefined): ColorKey | null {
	if (info?.institution_name) return { family: 'institutions', name: info.institution_name };
	if (info?.kind === 'category') {
		return { family: 'categories', name: account.slice(account.indexOf(':') + 1) };
	}
	return null;
}

/** Every name in `family` with the colour it has, from the accounts that carry one. */
export function familyColors(family: ColorFamily): Map<string, string> {
	const out = new Map<string, string>();
	for (const [account, info] of Object.entries(directory)) {
		const key = colorKey(account, info);
		if (key?.family === family && info.color) out.set(key.name, info.color);
	}
	return out;
}

/** What the ledger says about a spending category, by name, or undefined when there is none. */
export function categoryInfo(category: string): AccountInfo | undefined {
	return categories[category];
}

/** What the ledger says about `account`, or undefined when it isn't declared. */
export function accountInfo(account: string | null | undefined): AccountInfo | undefined {
	return account ? directory[account] : undefined;
}

/** Every declared account, closed ones included — what a reopen has to choose from. */
export function accountDirectory(): [string, AccountInfo][] {
	return Object.entries(directory);
}
