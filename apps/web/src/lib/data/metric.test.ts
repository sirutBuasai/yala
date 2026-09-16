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
		expect(tax.label).toEqual({ text: 'Tax' });
	});
});

describe('average', () => {
	it('per year divides lifetime by tracked years', () => {
		const d = makeData();
		const avg = average(d, 'income', 'year', { level: 'all' });
		expect(avg.value).toBe(2300);
		expect(avg.note).toEqual({ context: '2 tracked years' });
	});

	it('per month divides a year by ACTIVE months, not a flat 12', () => {
		const d = makeData();
		// 2024 has a single active month, so its spending is not divided by twelve.
		const avg = average(d, 'spending', 'month', { level: 'year', year: 2024 });
		expect(avg.value).toBe(120);
		expect(avg.note).toEqual({ context: '1 active months' });
	});

	it('per month at lifetime divides by the active months of every tracked year', () => {
		const d = makeData();
		// One active month in 2024, one in 2025.
		const avg = average(d, 'spending', 'month', { level: 'all' });
		expect(avg.value).toBeCloseTo((120 + 45.5) / 2);
		expect(avg.note).toEqual({ context: '2 active months' });
	});

	// One divisor for the whole row, so a reader can subtract one column from another.
	it('per month at lifetime divides every measure by the same months', () => {
		const d = makeData();
		const income = average(d, 'income', 'month', { level: 'all' }).value ?? 0;
		const spent = average(d, 'spending', 'month', { level: 'all' }).value ?? 0;
		const saved = average(d, 'saved', 'month', { level: 'all' }).value ?? 0;
		expect(saved).toBeCloseTo(income - spent);
	});

	// A month that logged spending but no income is active for EVERY measure, income included: counting
	// each measure's own months gave the columns different divisors, so the row stopped adding up.
	it('per month in a year counts a month with no income as active', () => {
		const d = makeData();
		d.months['2025-02'] = {
			total_spent: 10,
			total_income: 0,
			by_category: [{ category: 'Grocery', amount: 10 }],
			transactions: [],
			paychecks: []
		};
		d.years['2025']!.matrix[1] = { month: 2, spent: { Grocery: 10 }, income: 0 };
		d.overview.by_year[1] = { year: 2025, spent: 55.5, income: 2300, saved: 2244.5 };

		const yr = { level: 'year', year: 2025 } as const;
		const income = average(d, 'income', 'month', yr);
		const spent = average(d, 'spending', 'month', yr);
		const saved = average(d, 'saved', 'month', yr);

		expect(income.value).toBeCloseTo(2300 / 2);
		expect(spent.value).toBeCloseTo(55.5 / 2);
		expect(saved.value).toBeCloseTo((income.value ?? 0) - (spent.value ?? 0));
		for (const s of [income, spent, saved]) {
			expect(s.note).toEqual({ context: '2 active months' });
		}
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
		expect(s.note).toEqual({ text: 'of spending' });
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
		expect(max.note).toEqual({ context: 'Grocery' });
		const min = extremum(d, { level: 'all' }, 'category', 'min');
		expect(min.value).toBe(65.5);
		expect(min.note).toEqual({ context: 'Takeouts' });
	});
});

describe('change', () => {
	it('reports the current value with a YoY percentage delta', () => {
		const d = makeData();
		const c = change(d, 'spending', 'year', 2025);
		expect(c.value).toBe(45.5);
		expect(c.delta?.tone).toBe('good');
		expect(c.delta?.value).toBeCloseTo(((45.5 - 120) / 120) * 100, 6);
		expect(c.delta?.note).toBe('YoY');
	});

	it('omits the delta when the prior period is 0', () => {
		const d = makeData();
		// The fixture's first year has no prior year to compare against.
		expect(change(d, 'income', 'year', 2024).delta).toBeUndefined();
	});

	// The same movement is good news for one measure and bad for another.
	it('tones a rise by whether it is good news, not by its sign', () => {
		const spent = makeData();
		spent.overview.by_year[1]!.spent = 500;
		expect(change(spent, 'spending', 'year', 2025).delta?.tone).toBe('bad');

		const earned = makeData();
		earned.overview.by_year[1]!.income = 9000;
		expect(change(earned, 'income', 'year', 2025).delta?.tone).toBe('good');
	});

	it('leaves the level itself untoned — the badge carries the verdict', () => {
		expect(change(makeData(), 'spending', 'year', 2025).tone).toBeUndefined();
	});

	// Bug: dividing by a negative base flipped the percentage's sign away from the actual movement, so
	// a loss that shrank read as a fall.
	it('signs the percentage by the movement even when the base is negative', () => {
		const d = makeData();
		d.overview.by_year[0]!.saved = -100;
		d.overview.by_year[1]!.saved = -50;
		const c = change(d, 'saved', 'year', 2025);
		expect(c.delta?.value).toBeCloseTo(50, 6);
		expect(c.delta?.tone).toBe('good');
	});
});
