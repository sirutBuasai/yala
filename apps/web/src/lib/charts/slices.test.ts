import { describe, expect, it } from 'vitest';
import { categorySlices } from './slices';

describe('categorySlices', () => {
	it('sorts descending and colors each named slice', () => {
		const slices = categorySlices([
			{ category: 'Grocery', amount: 30 },
			{ category: 'Takeouts', amount: 70 }
		]);
		expect(slices.map((s) => s.name)).toEqual(['Takeouts', 'Grocery']);
		expect(slices[0].color).toBe('var(--salmon)'); // Takeouts token
		expect(slices[1].color).toBe('var(--green)'); // Grocery token
	});

	it('collapses everything past topN into a neutral Other slice', () => {
		const items = Array.from({ length: 9 }, (_, i) => ({
			category: `C${i}`,
			amount: 100 - i
		}));
		const slices = categorySlices(items, 6);
		expect(slices).toHaveLength(7); // 6 named + Other
		const other = slices.find((s) => s.name === 'Other')!;
		expect(other.color).toBe('var(--ink-3)');
		// remainder = amounts of C6..C8 = 94 + 93 + 92
		expect(other.value).toBe(94 + 93 + 92);
	});

	it('merges the tail into an existing real "Other" category rather than duplicating', () => {
		const items = [
			{ category: 'Other', amount: 50 },
			...Array.from({ length: 8 }, (_, i) => ({ category: `C${i}`, amount: 100 - i }))
		];
		const slices = categorySlices(items, 6);
		expect(slices.filter((s) => s.name === 'Other')).toHaveLength(1);
	});

	it('drops non-positive categories entirely (documents the current behavior)', () => {
		const slices = categorySlices([
			{ category: 'Grocery', amount: 30 },
			{ category: 'Refunded', amount: -10 },
			{ category: 'Zero', amount: 0 }
		]);
		expect(slices.map((s) => s.name)).toEqual(['Grocery']);
	});

	it('returns an empty array when nothing is positive', () => {
		expect(categorySlices([{ category: 'X', amount: -5 }])).toEqual([]);
	});
});
