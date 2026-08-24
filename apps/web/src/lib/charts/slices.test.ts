import { describe, expect, it } from 'vitest';
import { categorySlices } from './slices';

describe('categorySlices', () => {
	it('sorts descending and colors each named slice', () => {
		const slices = categorySlices([
			{ category: 'Grocery', amount: 30 },
			{ category: 'Takeouts', amount: 70 }
		]);
		expect(slices.map((s) => s.name)).toEqual(['Takeouts', 'Grocery']);
		expect(slices[0].color).toBe('var(--cat-takeouts)');
		expect(slices[1].color).toBe('var(--cat-grocery)');
	});

	it('shows every category individually when at or under the limit', () => {
		const items = Array.from({ length: 10 }, (_, i) => ({ category: `C${i}`, amount: 100 - i }));
		const slices = categorySlices(items);
		expect(slices).toHaveLength(10);
		expect(slices.some((s) => s.name === 'Other')).toBe(false);
	});

	it('caps at the limit, folding overflow into a combined "Other" slice', () => {
		// 12 categories, default limit 10 -> 9 named + 1 "Other"
		const items = Array.from({ length: 12 }, (_, i) => ({ category: `C${i}`, amount: 100 - i }));
		const slices = categorySlices(items);
		expect(slices).toHaveLength(10);
		const rest = slices[slices.length - 1];
		expect(rest.name).toBe('Other');
		expect(rest.color).toBe('var(--ink-3)');
		// combined value = ranks 10..12 (amounts for C9, C10, C11 = 91 + 90 + 89)
		expect(rest.value).toBe(91 + 90 + 89);
		expect(slices.slice(0, 9).every((s) => s.name !== 'Other')).toBe(true);
	});

	it('honors a custom limit', () => {
		const items = Array.from({ length: 9 }, (_, i) => ({ category: `C${i}`, amount: 100 - i }));
		const slices = categorySlices(items, 6); // 5 named + Other
		expect(slices).toHaveLength(6);
		expect(slices[slices.length - 1].name).toBe('Other');
		// remainder = ranks 6..9 (amounts 95 + 94 + 93 + 92)
		expect(slices[slices.length - 1].value).toBe(95 + 94 + 93 + 92);
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
