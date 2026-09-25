import { describe, expect, it } from 'vitest';
import type { PaycheckOut, Transfer, Txn } from '$lib/data/types';
import { filterHistory, historyOf, NO_FILTER, sortHistory, summarize } from './history';

const txn = (
	locator: string,
	date: string,
	amount: number,
	category: string,
	source: string | null,
	pending = false
): Txn => ({
	locator,
	date,
	payee: `Payee ${locator}`,
	amount,
	category,
	source,
	pending
});
const pay = (locator: string, date: string, take_home: number): PaycheckOut => ({
	locator,
	date,
	payee: 'Employer',
	gross: take_home * 1.5,
	deductions: {},
	contributions: {},
	net: take_home * 1.2,
	take_home
});
const xfer = (
	locator: string,
	date: string,
	amount: number,
	from: string,
	to: string
): Transfer => ({
	locator,
	date,
	payee: 'Autopay',
	amount,
	from_account: from,
	to_account: to,
	pending: false
});

const CARD = 'Liabilities:CC:CardA';
const BANK = 'Assets:Cash:Checking';

const month = {
	transactions: [
		txn('t1', '2026-09-03', 40, 'Takeouts', CARD),
		txn('t2', '2026-09-20', 90, 'Grocery', CARD, true),
		txn('t3', '2026-09-12', 25, 'Takeouts', BANK),
		txn('t4', '2026-09-14', -10, 'Takeouts', CARD)
	],
	paychecks: [pay('p1', '2026-09-15', 4000)],
	transfers: [xfer('x1', '2026-09-18', 600, BANK, CARD)]
};

describe('historyOf', () => {
	it('merges every kind of entry, newest first', () => {
		expect(historyOf(month).map((e) => e.locator)).toEqual(['t2', 'x1', 'p1', 't4', 't3', 't1']);
	});

	it('is empty for a month with no data', () => {
		expect(historyOf(undefined)).toEqual([]);
	});
});

describe('filterHistory', () => {
	const all = historyOf(month);
	const ids = (f: Partial<typeof NO_FILTER>) =>
		filterHistory(all, { ...NO_FILTER, ...f })
			.map((e) => e.locator)
			.sort();

	it('keeps one kind of entry', () => {
		expect(ids({ type: 'xfer' })).toEqual(['x1']);
	});

	it('keeps a category, which only transactions carry', () => {
		expect(ids({ category: 'Takeouts' })).toEqual(['t1', 't3', 't4']);
	});

	it('keeps every entry that moves money through an account, bill pay on either side included', () => {
		expect(ids({ account: CARD })).toEqual(['t1', 't2', 't4', 'x1']);
	});

	it('searches titles and the accounts bill pay moves between', () => {
		expect(ids({ search: 'payee t3' })).toEqual(['t3']);
		expect(ids({ search: 'autopay' })).toEqual(['x1']);
	});

	it('combines filters', () => {
		expect(ids({ category: 'Takeouts', account: CARD })).toEqual(['t1', 't4']);
	});
});

describe('summarize', () => {
	const all = historyOf(month);

	it('gives a figure for each kind of row present, netting refunds into spent', () => {
		expect(summarize(all)).toEqual({
			count: 6,
			spent: 145,
			takehome: 4000,
			billpay: 600,
			category: null
		});
	});

	it('leaves out the kinds a filter removed', () => {
		const s = summarize(filterHistory(all, { ...NO_FILTER, type: 'txn' }));
		expect(s.takehome).toBeNull();
		expect(s.billpay).toBeNull();
	});

	it('names the category when every transaction left shares one', () => {
		expect(summarize(filterHistory(all, { ...NO_FILTER, category: 'Takeouts' })).category).toBe(
			'Takeouts'
		);
		// Reached by search rather than the category filter: the rows decide, not the filter.
		expect(summarize(filterHistory(all, { ...NO_FILTER, search: 'payee t2' })).category).toBe(
			'Grocery'
		);
	});
});

describe('sortHistory', () => {
	const all = historyOf(month);

	it('orders by the amount each row shows, a paycheck by its net', () => {
		expect(sortHistory(all, 'amount', 'desc').map((e) => e.locator)).toEqual([
			'p1',
			'x1',
			't2',
			't1',
			't3',
			't4'
		]);
	});

	it('orders by category, rows without one first when ascending', () => {
		expect(sortHistory(all, 'category', 'asc').slice(-1)[0]!.locator).toBe('t1');
	});
});
