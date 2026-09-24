// The balance checklist's rules as pure functions: whether a typed figure agrees with the ledger,
// and what happens when it doesn't.

import { addDays } from '$lib/utils/period';

export type Group = 'Liquid' | 'Taxable' | 'Tax-advantaged' | 'Liabilities';
export const GROUP_ORDER: Group[] = ['Liquid', 'Taxable', 'Tax-advantaged', 'Liabilities'];

export interface Row {
	account: string;
	group: Group;
	liability: boolean;
	/** Reconciled against its bank app from a baseline on, rather than padded month to month. */
	card: boolean;
}

const CARD_PREFIX = 'Liabilities:CC:';

/** Agreement tolerance in cents — floats never land exactly on zero. */
const EPSILON = 0.005;

/** Order matters: the tax-advantaged subtree sits inside the investments subtree, so it is tested first. */
export function groupOf(account: string): Group {
	if (account.startsWith('Liabilities:')) return 'Liabilities';
	if (account.startsWith('Assets:Investments:TaxAdvantaged')) return 'Tax-advantaged';
	if (account.startsWith('Assets:Investments:')) return 'Taxable';
	return 'Liquid';
}

/** `label` is a parameter so this stays independent of how an account is formatted for display. */
export function buildRows(
	assetAccounts: string[],
	liabilityAccounts: string[],
	label: (account: string) => string
): Row[] {
	const rows: Row[] = [
		...assetAccounts.map((account) => ({
			account,
			group: groupOf(account),
			liability: false,
			card: false
		})),
		...liabilityAccounts.map((account) => ({
			account,
			group: 'Liabilities' as Group,
			liability: true,
			card: account.startsWith(CARD_PREFIX)
		}))
	];

	return rows.sort(
		(a, b) =>
			GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
			label(a.account).localeCompare(label(b.account))
	);
}

/**
 * What the ledger computes for an account at the end of the reading day, BEFORE anything new is
 * logged. A snapshot already standing on the reading has its own adjustment baked into the ledger's
 * figure, dated the reading day, so it must be backed out or the comparison reports agreement with
 * itself.
 */
export function expectedAt(
	account: string,
	atRead: Map<string, number>,
	adjRead: Map<string, number>,
	adjBefore: Map<string, number>,
	alreadyLogged: boolean
): number | null {
	const value = atRead.get(account);
	if (value == null) return null;

	const ownAdj = (adjRead.get(account) ?? 0) - (adjBefore.get(account) ?? 0);
	return alreadyLogged ? value - ownAdj : value;
}

/** The adjustment a new snapshot would post on its own. */
export function checkOf(typed: number | null, expected: number | null): number | null {
	return typed == null || expected == null ? null : typed - expected;
}

export function agrees(check: number | null): boolean {
	return check != null && Math.abs(check) < EPSILON;
}

/**
 * `negative` is an impossible figure; `share-snapshot` is a month already snapshotted in shares,
 * which is not a balance to rewrite; `unreconciled` is a card past its baseline whose figure its
 * entries do not explain.
 */
export type BlockReason = 'negative' | 'share-snapshot' | 'unreconciled';

/**
 * An asset's gap becomes an `Equity:Adjustments:*` plug and may not be negative. A card's gap before
 * its baseline becomes opening balance; past it there is nothing to absorb one, so `mustAgree` blocks
 * any gap until the missing spending or bill pay is entered.
 *
 * `correctable` false means the month's snapshot is share-based, which no typed USD figure replaces.
 */
export function blockReason(
	row: Row,
	typed: number | null,
	expected: number | null,
	correctable = true,
	mustAgree = false
): BlockReason | null {
	if (typed == null) return null;
	if (!correctable) return 'share-snapshot';
	if (mustAgree && !agrees(checkOf(typed, expected))) return 'unreconciled';

	return !row.liability && typed < 0 ? 'negative' : null;
}

/**
 * The day balances are read on by default: today in the current month, else the day before the
 * shown month's first, whose snapshot lands on that first.
 */
export function defaultReadOn(monthKey: string, today: string): string {
	return today.startsWith(monthKey) ? today : addDays(`${monthKey}-01`, -1);
}

/** Which kind of entry a liability's gap says is missing. */
export function missingEntryKind(gap: number): 'spending' | 'bill pay' {
	return gap < 0 ? 'spending' : 'bill pay';
}

/** Whether there is a reason at all, for a caller that does not need to word it. */
export function isBlocked(...args: Parameters<typeof blockReason>): boolean {
	return blockReason(...args) !== null;
}

/**
 * A liability is typed the way a statement reads it — owed positive, a credit negative — and the
 * ledger keeps that inverted. The sign is flipped, not forced: forcing it made a credit impossible
 * to enter, so an overpaid card came back as more owed.
 *
 * A flip is its own inverse, so `asTyped` is this same rule read the other way.
 */
export function signedForLedger(row: Row, typed: number): number {
	return row.liability ? -typed : typed;
}

/**
 * A stored figure in the convention it was typed in. Only the entry field and its ghost use it: the
 * figure columns stay in the ledger's sign, so logging an ordinary balance owed takes no minus.
 */
export const asTyped = signedForLedger;
