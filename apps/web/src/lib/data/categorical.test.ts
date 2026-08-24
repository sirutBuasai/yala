import { describe, expect, it } from 'vitest';
import { categorical, rollup, whereItWent } from '$lib/data/categorical';

describe('categorical', () => {
	it('sorts descending and drops non-positive amounts', () => {
		const c = categorical([
			{ category: 'Grocery', amount: 30 },
			{ category: 'Refunded', amount: -10 },
			{ category: 'Takeouts', amount: 70 },
			{ category: 'Zero', amount: 0 }
		]);
		expect(c.kind).toBe('categorical');
		expect(c.points.map((p) => p.key)).toEqual(['Takeouts', 'Grocery']);
		expect(c.unit).toEqual({ kind: 'money', currency: 'USD' });
	});
});

describe('rollup', () => {
	it('shows every point individually when at or under the limit', () => {
		const pts = Array.from({ length: 10 }, (_, i) => ({ key: `C${i}`, value: 100 - i }));
		const out = rollup(pts); // default limit 10
		expect(out).toHaveLength(10);
		expect(out.some((p) => p.key === 'Other')).toBe(false);
	});

	it('caps at the limit, folding overflow into a combined "Other" point', () => {
		// 12 points, default limit 10 -> 9 named + 1 "Other"
		const pts = Array.from({ length: 12 }, (_, i) => ({ key: `C${i}`, value: 100 - i }));
		const out = rollup(pts);
		expect(out).toHaveLength(10);
		const rest = out[out.length - 1]!;
		expect(rest.key).toBe('Other');
		// combined value = ranks 10..12 (values for C9, C10, C11 = 91 + 90 + 89)
		expect(rest.value).toBe(91 + 90 + 89);
		expect(out.slice(0, 9).every((p) => p.key !== 'Other')).toBe(true);
	});

	it('honors a custom limit', () => {
		const pts = Array.from({ length: 9 }, (_, i) => ({ key: `C${i}`, value: 100 - i }));
		const out = rollup(pts, 6); // 5 named + Other
		expect(out).toHaveLength(6);
		expect(out[out.length - 1]!.key).toBe('Other');
		expect(out[out.length - 1]!.value).toBe(95 + 94 + 93 + 92);
	});

	it('returns an empty array when nothing is positive', () => {
		expect(rollup([{ key: 'X', value: -5 }])).toEqual([]);
	});
});

describe('whereItWent', () => {
	it('appends a Saved slice when income exceeds spending', () => {
		const c = whereItWent(
			[
				{ category: 'Grocery', amount: 30 },
				{ category: 'Takeouts', amount: 20 }
			],
			100,
			50
		);
		const saved = c.points.find((p) => p.key === 'Saved');
		expect(saved?.value).toBe(50);
		// Saved is the last slice.
		expect(c.points[c.points.length - 1]!.key).toBe('Saved');
	});

	it('omits Saved when spending met or exceeded income', () => {
		const c = whereItWent([{ category: 'Grocery', amount: 120 }], 100, 120);
		expect(c.points.some((p) => p.key === 'Saved')).toBe(false);
	});

	it('leaves room for Saved under the cap (9 categories + Saved = 10)', () => {
		const items = Array.from({ length: 12 }, (_, i) => ({ category: `C${i}`, amount: 100 - i }));
		const c = whereItWent(items, 10000, 1000);
		expect(c.points).toHaveLength(10);
		expect(c.points.filter((p) => p.key === 'Other')).toHaveLength(1);
		expect(c.points[c.points.length - 1]!.key).toBe('Saved');
	});
});
