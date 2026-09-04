// The checklist's rules. Getting these wrong is not cosmetic: `expectedAt` deciding to compare a
// figure against itself would report agreement for every already-logged month, and `isBlocked`
// getting the asset/liability asymmetry backwards would paper over a missing entry with a plug.

import { describe, expect, it } from 'vitest';
import {
	agrees,
	blockReason,
	buildRows,
	checkOf,
	expectedAt,
	groupOf,
	isBlocked,
	missingEntryKind,
	signedForLedger,
	type Row
} from '$lib/balance/checklist';

describe('groupOf', () => {
	it('files a liability under Liabilities', () => {
		expect(groupOf('Liabilities:CC:CardAGold')).toBe('Liabilities');
	});

	it('files a plain cash account under Liquid', () => {
		expect(groupOf('Assets:Cash:BankA')).toBe('Liquid');
	});

	it('separates taxable from tax-advantaged investments', () => {
		expect(groupOf('Assets:Investments:Taxable:BrokerAStocks')).toBe('Taxable');
		expect(groupOf('Assets:Investments:TaxAdvantaged:Amazon401k')).toBe('Tax-advantaged');
	});

	it('tests the tax-advantaged subtree BEFORE the investments subtree it sits inside', () => {
		// A naive prefix order would call this one "Taxable", since it also starts with Investments:.
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
				'Assets:Investments:TaxAdvantaged:Yak'
			],
			['Liabilities:CC:Card'],
			label
		);
		expect(rows.map((r) => label(r.account))).toEqual(['Alpha', 'Beta', 'Zebra', 'Yak', 'Card']);
	});

	it('marks only the liability accounts as liabilities', () => {
		const rows = buildRows(['Assets:Cash:A'], ['Liabilities:CC:B'], label);
		expect(rows.map((r) => r.liability)).toEqual([false, true]);
	});

	it('copes with either list being empty', () => {
		expect(buildRows([], [], label)).toEqual([]);
		expect(buildRows([], ['Liabilities:CC:B'], label)).toHaveLength(1);
	});
});

describe('expectedAt', () => {
	const atNow = new Map([['A', 1000]]);

	it('is the ledger figure when nothing has been logged for this month yet', () => {
		expect(expectedAt('A', atNow, new Map(), new Map(), false)).toBe(1000);
	});

	it('backs out THIS month’s adjustment when a snapshot already stands on the date', () => {
		// 120 of plug total, 100 of which predates this month → 20 belongs to this month.
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
	const asset: Row = { account: 'Assets:Cash:A', group: 'Liquid', liability: false };
	const card: Row = { account: 'Liabilities:CC:B', group: 'Liabilities', liability: true };

	it('does not block an asset that drifted — that is what the adjustment plug is for', () => {
		expect(isBlocked(asset, 1200, 1000)).toBe(false);
	});

	it('blocks an impossible figure, naming it apart from a missing entry', () => {
		expect(blockReason(asset, -5, 1000)).toBe('negative');
		expect(blockReason(card, -1200, -1000)).toBe('missing-entry');
		expect(blockReason(asset, 1200, 1000)).toBeNull();
	});

	it('blocks a liability whose figure disagrees with the ledger', () => {
		expect(isBlocked(card, -1200, -1000)).toBe(true);
	});

	it('does not block a liability that agrees', () => {
		expect(isBlocked(card, -1000, -1000)).toBe(false);
	});

	it('does not block a row with nothing typed in it', () => {
		expect(isBlocked(card, null, -1000)).toBe(false);
	});
});

describe('missingEntryKind', () => {
	it('reads a shortfall as unlogged spending and a surplus as an unlogged bill pay', () => {
		expect(missingEntryKind(-50)).toBe('spending');
		expect(missingEntryKind(50)).toBe('bill pay');
	});
});

describe('signedForLedger', () => {
	const asset: Row = { account: 'Assets:Cash:A', group: 'Liquid', liability: false };
	const card: Row = { account: 'Liabilities:CC:B', group: 'Liabilities', liability: true };

	it('stores a liability negative however it was typed', () => {
		expect(signedForLedger(card, 500)).toBe(-500);
		expect(signedForLedger(card, -500)).toBe(-500);
	});

	it("leaves an asset's sign alone", () => {
		expect(signedForLedger(asset, 500)).toBe(500);
		expect(signedForLedger(asset, -20)).toBe(-20);
	});
});
