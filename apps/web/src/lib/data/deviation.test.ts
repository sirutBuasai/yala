import { describe, expect, it } from 'vitest';
import { categoryDeviation } from '$lib/data/deviation';
import { vsTypical } from '$lib/data/metric';
import { categorySpendByYear } from '$lib/data/series';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('categoryDeviation', () => {
	const rowFor = (data: ReturnType<typeof makeData>, month: string, cat: string) =>
		categoryDeviation(data, month).rows.find((r) => r.label === cat);

	it('measures each category against the average of the prior months', () => {
		const grocery = rowFor(makeData(), '2025-01', 'Grocery');

		expect(grocery?.value).toBeCloseTo(30);
		expect(grocery?.base).toBeCloseTo(70);
	});

	it('carries the range those prior months spanned, so a row can be judged against itself', () => {
		const data = makeData();
		data.meta.month_keys = ['2024-11', '2024-12', '2025-01'];
		data.months['2024-11'] = {
			...data.months['2024-12']!,
			by_category: [{ category: 'Grocery', amount: 10 }]
		};

		const grocery = rowFor(data, '2025-01', 'Grocery');
		expect(grocery?.lo).toBeCloseTo(10);
		expect(grocery?.hi).toBeCloseTo(70);
		expect(grocery?.base).toBeCloseTo(40);
	});

	it('ranks by distance from normal in either direction', () => {
		const rows = categoryDeviation(makeData(), '2025-01').rows;
		const mags = rows.map((r) => Math.abs(r.value - r.base));
		expect(mags).toEqual([...mags].sort((a, b) => b - a));
	});

	it('returns nothing for the first tracked month — there is no norm yet', () => {
		expect(categoryDeviation(makeData(), '2024-12').rows).toEqual([]);
	});

	it('reports a category that stopped entirely as a zero against its old normal', () => {
		const data = makeData();
		// Drop Takeouts from the later month; it should still appear, at nothing against its average.
		data.months['2025-01']!.by_category = [{ category: 'Grocery', amount: 30 }];

		const takeouts = rowFor(data, '2025-01', 'Takeouts');
		expect(takeouts?.value).toBe(0);
		expect(takeouts?.base).toBeCloseTo(50);
	});

	it('is empty for an unknown month', () => {
		expect(categoryDeviation(makeData(), '1999-01').rows).toEqual([]);
	});
});

describe('categorySpendByYear', () => {
	it('emits one series per category over the tracked years, biggest lifetime first', () => {
		const p = categorySpendByYear(makeData());

		expect(p.labels).toEqual(['2024', '2025']);
		expect(p.series.map((s) => s.name)).toEqual(['Grocery', 'Takeouts']);
		expect(p.series[0]!.points.map((pt) => pt.value)).toEqual([70, 30]);
		expect(p.series[1]!.points.map((pt) => pt.value)).toEqual([50, 15.5]);
	});

	it('omits categories with no spend anywhere, so no flat line hugs the axis', () => {
		const data = makeData();
		data.meta.categories = [...data.meta.categories, 'Travel'];

		const p = categorySpendByYear(data);
		expect(p.series.map((s) => s.name)).not.toContain('Travel');
	});
});

describe('vsTypical', () => {
	it('measures a month against the average of the months before it', () => {
		// Only one month precedes this one, so the norm is that month's spend.
		const s = vsTypical(makeData(), '2025-01', 'spending');
		expect(s.value).toBeCloseTo(45.5 - 120);
	});

	// Aggregates are memoized per document, so each case needs its own fixture.
	function overspending() {
		const data = makeData();
		data.months['2025-01']!.total_spent = 500;
		return data;
	}

	it('marks spending under the norm as good', () => {
		expect(vsTypical(makeData(), '2025-01', 'spending').tone).toBe('good');
	});

	it('marks spending over the norm as bad', () => {
		expect(vsTypical(overspending(), '2025-01', 'spending').tone).toBe('bad');
	});

	// Polarity comes from the measure, so the same overshoot reads the other way for income.
	it('marks income over the norm as good', () => {
		const data = makeData();
		data.months['2025-01']!.total_income = 9000;
		expect(vsTypical(data, '2025-01', 'income').tone).toBe('good');
	});

	it('is null on the first tracked month, where no norm exists', () => {
		expect(vsTypical(makeData(), '2024-12', 'spending').value).toBeNull();
	});

	it('names the average it compared against', () => {
		// Derived, so the average lands in the half a rename cannot swallow.
		expect(vsTypical(makeData(), '2025-01', 'spending').note?.context).toContain('average');
	});
});
