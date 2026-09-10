// The form choices that carry over to the next add; everything else on a form resets when it reopens.
// Storage is not trusted: every consumer resolves a remembered value against the live option list
// via `seed`, so an account that has since been closed falls back to the first available one.

import { listOf, matching, oneOf, persisted, type Revive } from '$lib/utils/persist.svelte';

/** Accepts any string, including '' — the "nothing remembered yet" value. */
const anyString: Revive<string> = (v) => (typeof v === 'string' ? v : undefined);

export const lastFundingAccount = persisted('last-funding-account', '', anyString);

export const lastCategory = persisted('last-category', '', anyString);

export const lastDepositAccount = persisted('last-deposit-account', '', anyString);

export const lastEmployer = persisted('last-employer', '', anyString);

/** Only the row LABELS, not their amounts: a paycheck's shape repeats, its figures don't. */
export const lastDeductionLabels = persisted<string[]>(
	'last-deduction-labels',
	[],
	listOf(anyString)
);
export const lastContributionLabels = persisted<string[]>(
	'last-contribution-labels',
	[],
	listOf(anyString)
);

export const lastTransferFrom = persisted('last-transfer-from', '', anyString);

export const lastTransferTo = persisted('last-transfer-to', '', anyString);

/** ISO "YYYY-MM-DD". Logging is a batch job, so the date just used beats today as the next default. */
export const lastEntryDate = persisted('last-entry-date', '', matching(/^\d{4}-\d{2}-\d{2}$/));

export const ENTRY_KINDS = ['transaction', 'paycheck', 'transfer', 'balance'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Only honoured when the invocation actually offers that kind. */
export const lastEntryKind = persisted<EntryKind>(
	'last-entry-kind',
	'transaction',
	oneOf(ENTRY_KINDS)
);

/** Keep a remembered choice if it's still on offer, else fall back to the first option. */
export function seed(remembered: string, options: string[]): string {
	return options.includes(remembered) ? remembered : (options[0] ?? '');
}
