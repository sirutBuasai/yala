// Sticky edit-form preferences: the choices that carry over to the next add, so entering several
// entries in a row doesn't re-pick the same account, category, or entry type each time. Everything
// else on a form resets when it reopens.
//
// These persist across sessions (not just the tab), because "the last thing I logged" is still the
// most likely next thing after a refresh or a restart. Storage is not trusted: every consumer
// resolves a remembered value against the live option list via `seed`, so an account or category
// that has since been closed simply falls back to the first available one.

import { listOf, matching, oneOf, persisted, type Revive } from '$lib/utils/persist.svelte';

/** Accepts any string, including '' — the "nothing remembered yet" value. */
const anyString: Revive<string> = (v) => (typeof v === 'string' ? v : undefined);

/** Last funding account chosen in "Add transaction" (e.g. "Liabilities:CC:CardA"). */
export const lastFundingAccount = persisted('last-funding-account', '', anyString);

/** Last spending category chosen in "Add transaction" (e.g. "Takeout"). */
export const lastCategory = persisted('last-category', '', anyString);

/** Last deposit account chosen in "Add paycheck" (e.g. "Assets:Cash:BankA"). */
export const lastDepositAccount = persisted('last-deposit-account', '', anyString);

/** Last employer chosen in "Add paycheck". */
export const lastEmployer = persisted('last-employer', '', anyString);

/**
 * The deduction and contribution LABELS a paycheck last used — "Tax", "Benefits", "Roth401k" — so
 * the next add opens with the same rows already laid out and only the figures to fill in. A
 * paycheck's shape barely changes between pay periods; its amounts change every time, which is why
 * only the labels are remembered.
 */
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

/** Last funding account paid from in "Add bill pay" (e.g. "Assets:Cash:BankA"). */
export const lastTransferFrom = persisted('last-transfer-from', '', anyString);

/** Last account paid toward in "Add bill pay" (e.g. "Liabilities:CC:CardA"). */
export const lastTransferTo = persisted('last-transfer-to', '', anyString);

/**
 * The date last committed on an entry, ISO "YYYY-MM-DD". Logging is usually a batch job over a few
 * days at once, so the date you just used beats today's date as the next default — and it beats the
 * ledger's newest entry date once you've moved off it deliberately.
 */
export const lastEntryDate = persisted('last-entry-date', '', matching(/^\d{4}-\d{2}-\d{2}$/));

/** The entry kinds the Add overlay can open on — the switcher's tabs. */
export const ENTRY_KINDS = ['transaction', 'paycheck', 'transfer', 'balance'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/**
 * The kind the Add overlay last committed on, so the next add opens where you left off: log a bill
 * pay and the next Add is already on Bill pay. Only honoured when the invocation actually offers
 * that kind — a page that adds one type still opens on the type its button named.
 */
export const lastEntryKind = persisted<EntryKind>(
	'last-entry-kind',
	'transaction',
	oneOf(ENTRY_KINDS)
);

/**
 * Resolve a remembered choice against the options currently on offer: keep it if it's still
 * available, else fall back to the first option. Shared by every form that seeds a select from a
 * sticky preference, so a closed account can never leave a form pointing at nothing.
 */
export function seed(remembered: string, options: string[]): string {
	return options.includes(remembered) ? remembered : (options[0] ?? '');
}
