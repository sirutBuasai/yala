import { describe, expect, it } from 'vitest';
import { makeData } from '$lib/data/__fixtures__/dashboard';
import { latestEntryDate, latestYear, scopeKey, scopeYear } from '$lib/data/scope';

describe('latestYear', () => {
	it('is the newest tracked year', () => {
		expect(latestYear(makeData())).toBe(2025);
	});

	it('falls back to the current calendar year for an untracked ledger', () => {
		const d = makeData();
		d.meta.years = [];
		expect(latestYear(d)).toBe(new Date().getFullYear());
	});
});

describe('scopeYear', () => {
	it('uses the scope’s own year when it has one', () => {
		expect(scopeYear(makeData(), { level: 'year', year: 2024 })).toBe(2024);
	});

	it('defaults to the latest tracked year', () => {
		expect(scopeYear(makeData(), { level: 'all' })).toBe(2025);
	});
});

describe('scopeKey', () => {
	it('distinguishes scopes that differ only in level', () => {
		expect(scopeKey({ level: 'year', year: 2025 })).not.toBe(
			scopeKey({ level: 'month', monthKey: '2025-01' })
		);
	});
});

// This is what a new entry's date defaults to. "Today" is the wrong default — a week of spending is
// logged in one sitting — so the rule is "wherever the ledger currently ends".
describe('latestEntryDate', () => {
	it('is the newest date across transactions, paychecks and transfers', () => {
		// The fixture's last month holds only a paycheck, dated after the previous month's spending.
		expect(latestEntryDate(makeData())).toBe('2025-01-15');
	});

	it('takes the maximum within the month, not the first entry', () => {
		const d = makeData();
		const md = d.months['2025-01']!;
		md.transactions = [
			{ ...structuredClone(d.months['2024-12']!.transactions[0]!), date: '2025-01-28' },
			{ ...structuredClone(d.months['2024-12']!.transactions[0]!), date: '2025-01-03' }
		];
		expect(latestEntryDate(d)).toBe('2025-01-28');
	});

	it('considers transfers too', () => {
		const d = makeData();
		d.months['2025-01']!.transfers = [
			{
				date: '2025-01-31',
				payee: 'payment',
				amount: 100,
				from_account: 'Assets:Cash:BankA',
				to_account: 'Liabilities:CC:CardA',
				pending: false,
				locator: 'id:xf-1'
			}
		];
		expect(latestEntryDate(d)).toBe('2025-01-31');
	});

	it('skips month keys that carry no data rather than reading undefined', () => {
		const d = makeData();
		d.meta.month_keys = [...d.meta.month_keys, '2025-02'];
		expect(latestEntryDate(d)).toBe('2025-01-15');
	});

	it('returns empty for a ledger with nothing logged', () => {
		const d = makeData();
		d.meta.month_keys = [];
		d.months = {};
		expect(latestEntryDate(d)).toBe('');
	});
});
