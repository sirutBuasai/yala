import { describe, expect, it } from 'vitest';
import { categoryByMonth } from '$lib/data/matrix';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('categoryByMonth', () => {
	it('columns are the categories with spend that year, incl. closed ones, biggest first', () => {
		const data = makeData();
		// Gym is closed (absent from meta.categories) but still has spend this year; Takeouts is
		// declared but has none.
		const y2025 = data.years['2025']!;
		y2025.matrix[0]!.spent = { Grocery: 30, Gym: 20 };
		y2025.matrix[1]!.spent = { Gym: 5 };

		const m = categoryByMonth(data, 2025);

		expect(m.cols).toEqual(['Grocery', 'Gym']);
		// values[monthIndex][categoryIndex]
		expect(m.values[0]).toEqual([30, 20]);
		expect(m.values[1]).toEqual([0, 5]);
	});

	it('orders columns by the year total so the biggest spender leads', () => {
		const data = makeData();
		data.years['2025']!.matrix[0]!.spent = { Grocery: 10, Gym: 90 };

		const m = categoryByMonth(data, 2025);

		expect(m.cols).toEqual(['Gym', 'Grocery']);
	});

	it('drops categories that have no data in the requested year', () => {
		const data = makeData();
		data.years['2025']!.matrix[0]!.spent = { Grocery: 10 };

		const m = categoryByMonth(data, 2025);

		expect(m.cols).toEqual(['Grocery']);
	});

	// A month with nothing logged is a blank row saying what the missing row already says — and a
	// part-finished year would otherwise end in a run of them.
	it('keeps only the months with a category logged, in calendar order', () => {
		const data = makeData();
		const y = data.years['2025']!;
		for (const row of y.matrix) row.spent = {};
		y.matrix[1]!.spent = { Grocery: 10 };
		y.matrix[4]!.spent = { Grocery: 20 };

		const m = categoryByMonth(data, 2025);

		expect(m.rows).toEqual(['Feb', 'May']);
		expect(m.values).toEqual([[10], [20]]);
	});

	// A row of zeroes is not the same as a row of nothing: a month whose categories net to zero was
	// still logged, and dropping it would lose the credit that cancelled the spend.
	it('keeps a month whose logged categories happen to net to zero', () => {
		const data = makeData();
		const y = data.years['2025']!;
		for (const row of y.matrix) row.spent = {};
		y.matrix[0]!.spent = { Grocery: 40, Utilities: -40 };

		const m = categoryByMonth(data, 2025);

		expect(m.rows).toEqual(['Jan']);
	});

	it('yields an empty grid for a year with no spend', () => {
		const m = categoryByMonth(makeData(), 1999);
		expect(m.rows).toEqual([]);
		expect(m.cols).toEqual([]);
		expect(m.values).toEqual([]);
	});
});
