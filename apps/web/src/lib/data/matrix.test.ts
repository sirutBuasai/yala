import { describe, expect, it } from 'vitest';
import { categoryByMonth } from '$lib/data/matrix';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('categoryByMonth', () => {
	it('columns are the union of categories with spend that year, incl. closed ones', () => {
		const data = makeData();
		// Gym is a closed category (absent from meta.categories) that still has 2025 spend;
		// Takeouts is in meta.categories but has no 2025 data here.
		const y2025 = data.years['2025']!;
		y2025.matrix[0]!.spent = { Grocery: 30, Gym: 20 };
		y2025.matrix[1]!.spent = { Gym: 5 };

		const m = categoryByMonth(data, 2025);

		expect(m.cols).toEqual(['Grocery', 'Gym']); // union of present keys, sorted; no Takeouts
		expect(m.rows.length).toBe(12);
		// values[monthIndex][categoryIndex]: Jan Grocery=30/Gym=20, Feb Gym=5, rest 0.
		expect(m.values[0]).toEqual([30, 20]);
		expect(m.values[1]).toEqual([0, 5]);
		expect(m.values[2]).toEqual([0, 0]);
	});

	it('drops categories that have no data in the requested year', () => {
		const data = makeData();
		data.years['2025']!.matrix[0]!.spent = { Grocery: 10 };

		const m = categoryByMonth(data, 2025);

		expect(m.cols).toEqual(['Grocery']);
	});

	it('yields empty columns for an unknown year', () => {
		const m = categoryByMonth(makeData(), 1999);
		expect(m.cols).toEqual([]);
		expect(m.values.every((row) => row.length === 0)).toBe(true);
	});
});
