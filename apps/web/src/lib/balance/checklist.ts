// The rules behind the balance checklist, as pure functions over plain values: the arithmetic that
// decides whether a typed figure agrees with the ledger, and what happens when it doesn't. Being
// wrong here means posting a bogus adjustment or refusing a legitimate one.

/** Which subtotal an account is counted under, and in what order the groups are shown. */
export type Group = 'Liquid' | 'Taxable' | 'Tax-advantaged' | 'Liabilities';
export const GROUP_ORDER: Group[] = ['Liquid', 'Taxable', 'Tax-advantaged', 'Liabilities'];

export interface Row {
	account: string;
	group: Group;
	/** Liabilities behave differently at almost every step, so the flag rides along with the row. */
	liability: boolean;
}

/** Cents. Anything closer than this counts as agreement — floats never land exactly on zero. */
const EPSILON = 0.005;

/**
 * Which split an account is tallied under, read from its ledger path. Order matters: the
 * tax-advantaged subtree is a subset of the investments subtree, so it has to be tested first.
 */
export function groupOf(account: string): Group {
	if (account.startsWith('Liabilities:')) return 'Liabilities';
	if (account.startsWith('Assets:Investments:TaxAdvantaged')) return 'Tax-advantaged';
	if (account.startsWith('Assets:Investments:')) return 'Taxable';
	return 'Liquid';
}

/**
 * Every loggable account as a row, grouped and then sorted by display name. `label` is passed in
 * rather than imported so this stays independent of how an account is formatted for display.
 */
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
 *
 * If an assertion already stands on this date, the ledger's figure has that assertion's own
 * adjustment baked in, so comparing against it would report agreement with itself; `adjNow -
 * adjPrev` isolates this month's plug, which is what gets backed out.
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

/** The adjustment this month's snapshot would post on its own — Balance minus Expected. */
export function checkOf(typed: number | null, expected: number | null): number | null {
	return typed == null || expected == null ? null : typed - expected;
}

/** Whether a typed figure agrees with the ledger, to the cent. */
export function agrees(check: number | null): boolean {
	return check != null && Math.abs(check) < EPSILON;
}

/** Why a row can't be saved as typed. `negative` is an impossible figure; `missing-entry` is a
    liability that disagrees with the ledger. */
export type BlockReason = 'negative' | 'missing-entry';

/**
 * Why a row must block instead of posting an adjustment, or null when it is savable.
 *
 * Assets are allowed to drift — markets move — so their gap becomes an `Equity:Adjustments:*` plug.
 * A liability has no such licence: a card's balance is fully determined by the spending and bill
 * payments already entered, so a gap there means an entry is MISSING, and plugging it would paper
 * over the very thing the checklist exists to surface. Either way a snapshot is what an account
 * holds or owes, which is never a negative figure.
 */
export function blockReason(
	row: Row,
	typed: number | null,
	expected: number | null
): BlockReason | null {
	if (typed == null) return null;
	if (row.liability) {
		return agrees(checkOf(typed, expected)) ? null : 'missing-entry';
	}
	return typed < 0 ? 'negative' : null;
}

export function isBlocked(row: Row, typed: number | null, expected: number | null): boolean {
	return blockReason(row, typed, expected) !== null;
}

/** A liability's gap tells you which kind of entry is missing. */
export function missingEntryKind(gap: number): 'spending' | 'bill pay' {
	return gap < 0 ? 'spending' : 'bill pay';
}

/** Liabilities are typed as the amount owed but stored negative — the sign the ledger keeps. */
export function signedForLedger(row: Row, typed: number): number {
	return row.liability ? -Math.abs(typed) : typed;
}
