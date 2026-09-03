import { describe, expect, it } from 'vitest';
import { categoryDeviation } from '$lib/data/categorical';
import { vsTypical } from '$lib/data/metric';
import { categorySpendByYear } from '$lib/data/series';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('categoryDeviation', () => {
	it('signs each category against the average of the prior months', () => {
		const data = makeData();
		// 2024-12: Grocery 70 / Takeouts 50. 2025-01: Grocery 30 / Takeouts 15.5.
		const p = categoryDeviation(data, '2025-01');

		const by = Object.fromEntries(p.points.map((pt) => [pt.key, pt.value]));
		expect(by['Grocery']).toBeCloseTo(30 - 70);
		expect(by['Takeouts']).toBeCloseTo(15.5 - 50);
	});

	it('ranks by distance from normal in either direction', () => {
		const p = categoryDeviation(makeData(), '2025-01');
		const mags = p.points.map((pt) => Math.abs(pt.value));
		expect(mags).toEqual([...mags].sort((a, b) => b - a));
	});

	it('returns nothing for the first tracked month — there is no norm yet', () => {
		const p = categoryDeviation(makeData(), '2024-12');
		expect(p.points).toEqual([]);
	});

	it('reports a category that stopped entirely as a negative deviation', () => {
		const data = makeData();
		// Drop Takeouts from the later month; it should still appear, fully negative.
		data.months['2025-01']!.by_category = [{ category: 'Grocery', amount: 30 }];

		const p = categoryDeviation(data, '2025-01');
		const takeouts = p.points.find((pt) => pt.key === 'Takeouts');
		expect(takeouts?.value).toBeCloseTo(-50);
	});

	it('is empty for an unknown month', () => {
		expect(categoryDeviation(makeData(), '1999-01').points).toEqual([]);
	});
});

describe('categorySpendByYear', () => {
	it('emits one series per category over the tracked years, biggest lifetime first', () => {
		const p = categorySpendByYear(makeData());

		expect(p.labels).toEqual(['2024', '2025']);
		expect(p.series.map((s) => s.name)).toEqual(['Grocery', 'Takeouts']);
		// Grocery: 70 in 2024, 30 in 2025.
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
		// Only 2024-12 precedes 2025-01, so the norm is that month's 120 spend.
		const s = vsTypical(makeData(), '2025-01', 'spending');
		expect(s.value).toBeCloseTo(45.5 - 120);
	});

	// Aggregates are memoized per DashboardData, so each case needs its own fixture rather than
	// mutating one that has already been read.
	function overspending() {
		const data = makeData();
		data.months['2025-01']!.total_spent = 500;
		return data;
	}

	it('marks spending under the norm as good', () => {
		expect(vsTypical(makeData(), '2025-01', 'spending').dir).toBe('up');
	});

	it('marks spending over the norm as bad', () => {
		expect(vsTypical(overspending(), '2025-01', 'spending').dir).toBe('down');
	});

	it('flips the direction sense when higher is better', () => {
		expect(vsTypical(overspending(), '2025-01', 'spending', { higherIsBetter: true }).dir).toBe(
			'up'
		);
	});

	it('is null on the first tracked month, where no norm exists', () => {
		expect(vsTypical(makeData(), '2024-12', 'spending').value).toBeNull();
	});

	it('names the average it compared against', () => {
		expect(vsTypical(makeData(), '2025-01', 'spending').note).toContain('average');
	});
});
