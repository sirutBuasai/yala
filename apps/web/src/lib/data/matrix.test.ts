import { describe, expect, it } from 'vitest';
import { categoryByMonth } from '$lib/data/matrix';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('categoryByMonth', () => {
	it('rows are the categories with spend that year, incl. closed ones, biggest first', () => {
		const data = makeData();
		// Gym is closed (absent from meta.categories) but still has spend this year; Takeouts is
		// declared but has none.
		const y2025 = data.years['2025']!;
		y2025.matrix[0]!.spent = { Grocery: 30, Gym: 20 };
		y2025.matrix[1]!.spent = { Gym: 5 };

		const m = categoryByMonth(data, 2025);

		expect(m.rows).toEqual(['Grocery', 'Gym']);
		expect(m.cols.length).toBe(12);
		// values[categoryIndex][monthIndex]
		expect(m.values[0]!.slice(0, 3)).toEqual([30, 0, 0]);
		expect(m.values[1]!.slice(0, 3)).toEqual([20, 5, 0]);
	});

	it('orders rows by the year total so the biggest spender leads', () => {
		const data = makeData();
		data.years['2025']!.matrix[0]!.spent = { Grocery: 10, Gym: 90 };

		const m = categoryByMonth(data, 2025);

		expect(m.rows).toEqual(['Gym', 'Grocery']);
	});

	it('drops categories that have no data in the requested year', () => {
		const data = makeData();
		data.years['2025']!.matrix[0]!.spent = { Grocery: 10 };

		const m = categoryByMonth(data, 2025);

		expect(m.rows).toEqual(['Grocery']);
	});

	it('yields no rows for an unknown year', () => {
		const m = categoryByMonth(makeData(), 1999);
		expect(m.rows).toEqual([]);
		expect(m.values).toEqual([]);
		expect(m.cols.length).toBe(12); // the month axis is fixed whatever the data
	});
});
