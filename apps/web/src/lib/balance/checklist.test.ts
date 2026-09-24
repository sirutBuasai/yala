import { describe, expect, it } from 'vitest';
import {
	agrees,
	asTyped,
	blockReason,
	buildRows,
	checkOf,
	defaultReadOn,
	expectedAt,
	groupOf,
	isBlocked,
	missingEntryKind,
	signedForLedger,
	type Row
} from '$lib/balance/checklist';

const asset: Row = { account: 'Assets:Cash:A', group: 'Liquid', liability: false, card: false };
const card: Row = {
	account: 'Liabilities:CC:B',
	group: 'Liabilities',
	liability: true,
	card: true
};

describe('groupOf', () => {
	it('files a liability under Liabilities', () => {
		expect(groupOf('Liabilities:CC:CardAGold')).toBe('Liabilities');
	});

	it('files a plain cash account under Liquid', () => {
		expect(groupOf('Assets:Cash:BankA')).toBe('Liquid');
	});

	it('separates taxable from tax-advantaged investments', () => {
		expect(groupOf('Assets:Investments:Taxable:BrokerAStocks')).toBe('Taxable');
		expect(groupOf('Assets:Investments:TaxAdvantaged:EmployerA401k')).toBe('Tax-advantaged');
	});

	it('tests the tax-advantaged subtree BEFORE the investments subtree it sits inside', () => {
		expect(groupOf('Assets:Investments:TaxAdvantaged:RothIRA')).not.toBe('Taxable');
	});
});

describe('buildRows', () => {
	const label = (a: string) => a.split(':').at(-1) ?? a;

	it('orders by group first, then by display name within a group', () => {
		const rows = buildRows(
			[
				'Assets:Investments:Taxable:Zebra',
				'Assets:Cash:Beta',
				'Assets:Cash:Alpha',
				'Assets:Investments:TaxAdvantaged:PlanA'
			],
			['Liabilities:CC:Card'],
			label
		);
		expect(rows.map((r) => label(r.account))).toEqual(['Alpha', 'Beta', 'Zebra', 'PlanA', 'Card']);
	});

	it('marks only the liability accounts as liabilities', () => {
		const rows = buildRows(['Assets:Cash:A'], ['Liabilities:CC:B'], label);
		expect(rows.map((r) => r.liability)).toEqual([false, true]);
	});

	it('marks only a credit card as reconciled, not every liability', () => {
		const rows = buildRows([], ['Liabilities:CC:B', 'Liabilities:TaxesOwed'], label);
		expect(rows.map((r) => [label(r.account), r.card])).toEqual([
			['B', true],
			['TaxesOwed', false]
		]);
	});

	it('copes with either list being empty', () => {
		expect(buildRows([], [], label)).toEqual([]);
		expect(buildRows([], ['Liabilities:CC:B'], label)).toHaveLength(1);
	});
});

describe('expectedAt', () => {
	const atNow = new Map([['A', 1000]]);

	it('is the ledger figure when nothing has been logged on the reading yet', () => {
		expect(expectedAt('A', atNow, new Map(), new Map(), false)).toBe(1000);
	});

	it('backs out the reading’s own adjustment when a snapshot already stands on it', () => {
		const adjNow = new Map([['A', 120]]);
		const adjPrev = new Map([['A', 100]]);
		expect(expectedAt('A', atNow, adjNow, adjPrev, true)).toBe(980);
	});

	it('leaves the figure alone when a snapshot stands but posted no adjustment', () => {
		const adj = new Map([['A', 50]]);
		expect(expectedAt('A', atNow, adj, adj, true)).toBe(1000);
	});

	it('ignores adjustments entirely when nothing is logged for the month', () => {
		expect(expectedAt('A', atNow, new Map([['A', 120]]), new Map(), false)).toBe(1000);
	});

	it('is null for an account the ledger has no figure for', () => {
		expect(expectedAt('missing', atNow, new Map(), new Map(), false)).toBeNull();
	});
});

describe('checkOf / agrees', () => {
	it('is the gap between what was typed and what the ledger expected', () => {
		expect(checkOf(1010, 1000)).toBe(10);
		expect(checkOf(990, 1000)).toBe(-10);
	});

	it('is null when either side is unknown', () => {
		expect(checkOf(null, 1000)).toBeNull();
		expect(checkOf(1000, null)).toBeNull();
	});

	it('treats a sub-cent difference as agreement, since floats never land on zero', () => {
		expect(agrees(checkOf(1000.001, 1000))).toBe(true);
		expect(agrees(0)).toBe(true);
	});

	it('treats a cent as a real difference', () => {
		expect(agrees(checkOf(1000.01, 1000))).toBe(false);
	});

	it('does not claim agreement when there is nothing to compare', () => {
		expect(agrees(null)).toBe(false);
	});
});

describe('isBlocked', () => {
	it('does not block an asset that drifted — that is what the adjustment plug is for', () => {
		expect(isBlocked(asset, 1200, 1000)).toBe(false);
	});

	it('blocks an impossible figure on an asset only', () => {
		expect(blockReason(asset, -5, 1000)).toBe('negative');
		expect(blockReason(asset, 1200, 1000)).toBeNull();
		// A liability is typed owed-positive and stored negative, so its stored figure is not
		// "impossible"; a credit is a real state.
		expect(blockReason(card, -1200, -1000)).toBeNull();
	});

	it('does not block a card that disagrees before its baseline — the gap is its starting balance', () => {
		expect(isBlocked(card, -1200, -1000)).toBe(false);
	});

	it('blocks a card past its baseline until its entries explain the figure', () => {
		expect(blockReason(card, -1200, -1000, true, true)).toBe('unreconciled');
		expect(blockReason(card, -1000, -1000, true, true)).toBeNull();
	});

	it('does not block a liability that agrees', () => {
		expect(isBlocked(card, -1000, -1000)).toBe(false);
	});

	it('does not block a row with nothing typed in it', () => {
		expect(isBlocked(card, null, -1000)).toBe(false);
	});

	it("blocks a figure over a month's share snapshot, whatever was typed", () => {
		expect(blockReason(asset, 1000, 1000, false)).toBe('share-snapshot');
		// even an otherwise-valid figure, and even one that agrees
		expect(blockReason(card, -1000, -1000, false)).toBe('share-snapshot');
	});

	it('leaves a share-snapshot row alone until something is typed in it', () => {
		expect(isBlocked(asset, null, 1000, false)).toBe(false);
	});
});

describe('signedForLedger', () => {
	it('inverts a liability: owed typed positive is stored negative', () => {
		expect(signedForLedger(card, 500)).toBe(-500);
	});

	it('keeps a liability credit a credit rather than forcing it to owed', () => {
		// Forcing the sign made an overpaid card or a tax refund due read as more owed.
		expect(signedForLedger(card, -800)).toBe(800);
	});

	it("leaves an asset's sign alone", () => {
		expect(signedForLedger(asset, 500)).toBe(500);
		expect(signedForLedger(asset, -20)).toBe(-20);
	});

	it('round-trips a stored figure back to what the field takes', () => {
		expect(asTyped(card, signedForLedger(card, 500))).toBe(500);
		expect(asTyped(card, signedForLedger(card, -800))).toBe(-800);
		expect(asTyped(asset, signedForLedger(asset, -20))).toBe(-20);
	});

	it('ghosts a stored liability credit back as a negative figure', () => {
		// The ledger holds a credit positive; the field shows it the way it was typed.
		expect(asTyped(card, 898)).toBe(-898);
		expect(asTyped(card, -556.69)).toBe(556.69);
	});
});

describe('missingEntryKind', () => {
	it('reads a shortfall as unlogged spending and a surplus as an unlogged bill pay', () => {
		expect(missingEntryKind(-50)).toBe('spending');
		expect(missingEntryKind(50)).toBe('bill pay');
	});
});

describe('defaultReadOn', () => {
	it('reads today in the current month', () => {
		expect(defaultReadOn('2026-09', '2026-09-23')).toBe('2026-09-23');
	});

	it('reads a past month on the day before its first, so the snapshot lands on that first', () => {
		expect(defaultReadOn('2026-08', '2026-09-23')).toBe('2026-07-31');
		expect(defaultReadOn('2026-01', '2026-09-23')).toBe('2025-12-31');
	});
});
