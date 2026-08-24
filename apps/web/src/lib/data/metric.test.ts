import { describe, expect, it } from 'vitest';
import { makeData } from '$lib/data/__fixtures__/dashboard';
import {
	amount,
	average,
	categoryAmount,
	categoryShare,
	change,
	count,
	extremum,
	ratio
} from './metric';

// Fixture recap: 2024 {spent 120, income 2300, saved 2180}, 2025 {spent 45.5, income 2300,
// saved 2254.5}. income.by_year: both years gross 3000, net 2300, take_home 1550,
// deductions 700, contributions 750. 2025-01 has one paycheck; 2024-12 has one txn (70).

describe('amount', () => {
	it('sums aggregate fields across the lifetime', () => {
		const d = makeData();
		expect(amount(d, { level: 'all' }, 'income').value).toBe(4600);
		expect(amount(d, { level: 'all' }, 'spending').value).toBe(165.5);
		expect(amount(d, { level: 'all' }, 'gross').value).toBe(6000);
	});

	it('reads a single year', () => {
		const d = makeData();
		expect(amount(d, { level: 'year', year: 2024 }, 'spending').value).toBe(120);
		expect(amount(d, { level: 'year', year: 2025 }, 'saved').value).toBe(2254.5);
	});

	it('derives month figures, aggregating paychecks for income breakdown fields', () => {
		const d = makeData();
		expect(amount(d, { level: 'month', monthKey: '2024-12' }, 'spending').value).toBe(120);
		expect(amount(d, { level: 'month', monthKey: '2024-12' }, 'saved').value).toBe(2180);
		// 2025-01 paycheck: deductions {Tax 600, Benefits 100} = 700, contributions 750.
		expect(amount(d, { level: 'month', monthKey: '2025-01' }, 'gross').value).toBe(3000);
		expect(amount(d, { level: 'month', monthKey: '2025-01' }, 'deductions').value).toBe(700);
		expect(amount(d, { level: 'month', monthKey: '2025-01' }, 'contributions').value).toBe(750);
	});

	it('reads a paycheck component (deduction key) at a scope', () => {
		const d = makeData();
		const tax = amount(
			d,
			{ level: 'month', monthKey: '2025-01' },
			{ group: 'deductions', key: 'Tax' }
		);
		expect(tax.value).toBe(600);
		expect(tax.label).toBe('Tax');
	});
});

describe('average', () => {
	it('per year divides lifetime by tracked years', () => {
		const d = makeData();
		const avg = average(d, 'income', 'year');
		expect(avg.value).toBe(2300); // 4600 / 2
		expect(avg.note).toBe('2 tracked years');
	});

	it('per month divides a year by ACTIVE months, not a flat 12', () => {
		const d = makeData();
		// 2024 has one active month (Dec): 120 spending / 1 = 120, not 120/12.
		const avg = average(d, 'spending', 'month', 2024);
		expect(avg.value).toBe(120);
		expect(avg.note).toBe('1 active months');
	});
});

describe('ratio', () => {
	it('savings rate as a percentage', () => {
		const d = makeData();
		const r = ratio(d, { level: 'all' }, 'saved', 'income');
		expect(r.value).toBeCloseTo((4434.5 / 4600) * 100, 6);
		expect(r.unit).toEqual({ kind: 'percent' });
	});

	it('is null when the denominator is 0', () => {
		const d = makeData();
		// A year with no data → income 0 → null.
		expect(ratio(d, { level: 'year', year: 2099 }, 'saved', 'income').value).toBeNull();
	});
});

describe('categoryAmount / categoryShare', () => {
	it('reads a category at each scope', () => {
		const d = makeData();
		expect(categoryAmount(d, { level: 'all' }, 'Grocery').value).toBe(100);
		expect(categoryAmount(d, { level: 'year', year: 2024 }, 'Grocery').value).toBe(70);
		expect(categoryAmount(d, { level: 'month', monthKey: '2025-01' }, 'Grocery').value).toBe(30);
	});

	it('computes a category share of spending', () => {
		const d = makeData();
		const s = categoryShare(d, { level: 'all' }, 'Grocery', 'spending');
		expect(s.value).toBeCloseTo((100 / 165.5) * 100, 6);
		expect(s.note).toBe('of spending');
	});
});

describe('count', () => {
	it('counts transactions, paychecks, active months, and categories', () => {
		const d = makeData();
		expect(count(d, { level: 'month', monthKey: '2024-12' }, 'transactions').value).toBe(1);
		expect(count(d, { level: 'month', monthKey: '2025-01' }, 'paychecks').value).toBe(1);
		expect(count(d, { level: 'year', year: 2024 }, 'active_months').value).toBe(1);
		expect(count(d, { level: 'all' }, 'categories').value).toBe(2);
		expect(count(d, { level: 'all' }, 'transactions').unit).toEqual({ kind: 'count' });
	});
});

describe('extremum', () => {
	it('finds the biggest / smallest category with its name in the note', () => {
		const d = makeData();
		const max = extremum(d, { level: 'all' }, 'category', 'max');
		expect(max.value).toBe(100);
		expect(max.note).toBe('Grocery');
		const min = extremum(d, { level: 'all' }, 'category', 'min');
		expect(min.value).toBe(65.5);
		expect(min.note).toBe('Takeouts');
	});
});

describe('change', () => {
	it('reports the current value with a YoY percentage delta', () => {
		const d = makeData();
		// spending 2025 = 45.5 vs 2024 = 120 → down ~62%.
		const c = change(d, 'spending', 'year', 2025);
		expect(c.value).toBe(45.5);
		expect(c.delta?.dir).toBe('down');
		expect(c.delta?.value).toBeCloseTo(((45.5 - 120) / 120) * 100, 6);
		expect(c.delta?.note).toBe('YoY');
	});

	it('omits the delta when the prior period is 0', () => {
		const d = makeData();
		// 2024 has no prior year in the fixture → prior income 0 → no delta.
		expect(change(d, 'income', 'year', 2024).delta).toBeUndefined();
	});
});
