import { describe, it, expect } from 'vitest';
import { fitFontSize, labelIndices, moneyYScale } from './axis';

describe('moneyYScale', () => {
	it('anchors the domain at zero for all-positive values', () => {
		const { y } = moneyYScale([10, 40, 90], 300);
		expect(y(0)).toBe(300); // zero sits at the bottom (range start)
		expect(y.domain()[0]).toBe(0);
		expect(y.domain()[1]).toBeGreaterThanOrEqual(90);
	});

	it('extends the domain below zero when values are negative', () => {
		const { y } = moneyYScale([-50, 20], 300);
		expect(y.domain()[0]).toBeLessThanOrEqual(-50);
		expect(y.domain()[1]).toBeGreaterThanOrEqual(20);
		expect(y(0)).toBeGreaterThan(0);
		expect(y(0)).toBeLessThan(300);
	});

	it('maps the top of the range to y=0', () => {
		const { y } = moneyYScale([100], 300);
		expect(y(y.domain()[1]!)).toBe(0);
	});

	it('produces a handful of nice ticks', () => {
		const { ticks } = moneyYScale([0, 100], 300);
		expect(ticks.length).toBeGreaterThan(0);
		expect(ticks.length).toBeLessThanOrEqual(6);
		expect(ticks).toContain(0);
	});

	it('handles an empty series without throwing', () => {
		const { y, ticks } = moneyYScale([], 300);
		expect(Number.isFinite(y(0))).toBe(true);
		expect(ticks).toContain(0);
	});
});

describe('labelIndices', () => {
	const dates = (n: number) =>
		Array.from({ length: n }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}-01`);

	it('shows every label when they all fit', () => {
		expect(labelIndices(4, 900, dates(4))).toEqual([0, 1, 2, 3]);
	});

	it('thins to what the width allows, not to a fixed count', () => {
		const wide = labelIndices(24, 900, dates(24));
		const narrow = labelIndices(24, 260, dates(24));
		expect(narrow.length).toBeLessThan(wide.length);
	});

	it('always keeps the last label — it is the one readers look for', () => {
		for (const n of [7, 9, 13, 24, 38]) {
			expect(labelIndices(n, 400, dates(n)).at(-1)).toBe(n - 1);
		}
	});

	it('drops the neighbour that would collide with the last label', () => {
		// 9 points in a narrow box: a plain stride would place one right beside the final label.
		const shown = labelIndices(9, 300, dates(9));
		const [secondLast, last] = shown.slice(-2);
		expect(last! - secondLast!).toBeGreaterThan(1);
	});

	it('handles degenerate series', () => {
		expect(labelIndices(0, 500, [])).toEqual([]);
		expect(labelIndices(1, 500, ['2026-01-01'])).toEqual([0]);
	});
});

describe('fitFontSize', () => {
	it('shrinks to fit a long label in a tight gutter', () => {
		const tight = fitFontSize(60, ['Tax-advantaged:CharlesSchwabIndividual']);
		const roomy = fitFontSize(200, ['Tax-advantaged:CharlesSchwabIndividual']);
		expect(tight).toBeLessThan(roomy);
	});

	it('never drops below the floor, however long the label', () => {
		expect(fitFontSize(20, ['x'.repeat(400)], 8, 12)).toBe(8);
	});

	it('never exceeds the ceiling, however short the label', () => {
		expect(fitFontSize(400, ['a'], 8, 12)).toBe(12);
	});

	it('sizes to the LONGEST label, not the first', () => {
		expect(fitFontSize(100, ['a', 'a very long category name'])).toBe(
			fitFontSize(100, ['a very long category name'])
		);
	});

	it('survives an empty label list rather than returning NaN', () => {
		expect(fitFontSize(100, [], 8, 12)).toBe(12);
	});
});
