// The balance checklist's rules as pure functions: whether a typed figure agrees with the ledger,
// and what happens when it doesn't.

export type Group = 'Liquid' | 'Taxable' | 'Tax-advantaged' | 'Liabilities';
export const GROUP_ORDER: Group[] = ['Liquid', 'Taxable', 'Tax-advantaged', 'Liabilities'];

export interface Row {
	account: string;
	group: Group;
	liability: boolean;
}

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
		...assetAccounts.map((account) => ({ account, group: groupOf(account), liability: false })),
		...liabilityAccounts.map((account) => ({
			account,
			group: 'Liabilities' as Group,
			liability: true
		}))
	];

	return rows.sort(
		(a, b) =>
			GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
			label(a.account).localeCompare(label(b.account))
	);
}

/**
 * What the ledger computes for an account at this month's snapshot, BEFORE anything new is logged.
 * An assertion already standing on this date has its own adjustment baked into the ledger's figure,
 * so it must be backed out or the comparison reports agreement with itself.
 */
export function expectedAt(
	account: string,
	atNow: Map<string, number>,
	adjNow: Map<string, number>,
	adjPrev: Map<string, number>,
	alreadyLogged: boolean
): number | null {
	const value = atNow.get(account);
	if (value == null) return null;

	const thisMonthAdj = (adjNow.get(account) ?? 0) - (adjPrev.get(account) ?? 0);
	return alreadyLogged ? value - thisMonthAdj : value;
}

/** The adjustment this month's snapshot would post on its own. */
export function checkOf(typed: number | null, expected: number | null): number | null {
	return typed == null || expected == null ? null : typed - expected;
}

export function agrees(check: number | null): boolean {
	return check != null && Math.abs(check) < EPSILON;
}

/**
 * `negative` is an impossible figure; `missing-entry` is a liability that disagrees with the ledger;
 * `share-snapshot` is a month already snapshotted in shares, which is not a balance to rewrite.
 */
export type BlockReason = 'negative' | 'missing-entry' | 'share-snapshot';

/**
 * Assets may drift, so their gap becomes an `Equity:Adjustments:*` plug. A liability's balance is
 * fully determined by the entries already logged, so a gap there means an entry is MISSING and must
 * block rather than be plugged over. Neither may be negative.
 *
 * `correctable` false means the month's snapshot is share-based, which no typed USD figure replaces.
 */
export function blockReason(
	row: Row,
	typed: number | null,
	expected: number | null,
	correctable = true
): BlockReason | null {
	if (typed == null) return null;
	if (!correctable) return 'share-snapshot';
	if (row.liability) {
		return agrees(checkOf(typed, expected)) ? null : 'missing-entry';
	}
	return typed < 0 ? 'negative' : null;
}

/** Whether there is a reason at all, for a caller that does not need to word it. */
export function isBlocked(...args: Parameters<typeof blockReason>): boolean {
	return blockReason(...args) !== null;
}

/** Which kind of entry a liability's gap says is missing. */
export function missingEntryKind(gap: number): 'spending' | 'bill pay' {
	return gap < 0 ? 'spending' : 'bill pay';
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
