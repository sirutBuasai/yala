import { describe, it, expect } from 'vitest';
import { fitFontSize, labelIndices, moneyAxisFormat, moneyYScale, signedYScale } from './axis';

describe('moneyAxisFormat', () => {
	it('abbreviates once every tick worth abbreviating clears a thousand', () => {
		const fmt = moneyAxisFormat([0, 100000, 200000, 300000]);
		expect(fmt(200000)).toBe('$200k');
	});

	it('stays exact where any tick is under a thousand', () => {
		const fmt = moneyAxisFormat([0, 250, 500, 750]);
		expect(fmt(500)).toBe('$500');
	});

	// Zero sits on almost every money axis, so testing it would keep every axis unabbreviated — and
	// `moneyK` would render it "$0.0k".
	it('always renders zero exactly, and lets it off the threshold test', () => {
		expect(moneyAxisFormat([0, 5000, 10000])(0)).toBe('$0');
		expect(moneyAxisFormat([0, 5000, 10000])(5000)).toBe('$5.0k');
	});

	it('handles a negative axis off the magnitude', () => {
		const fmt = moneyAxisFormat([-4000, -2000, 0, 2000]);
		expect(fmt(-4000)).toBe('-$4.0k');
	});

	it('stays exact when it has no ticks to judge by', () => {
		expect(moneyAxisFormat([])(1500)).toBe('$1,500');
		expect(moneyAxisFormat([0])(1500)).toBe('$1,500');
	});
});

describe('signedYScale', () => {
	it('puts zero where the data does: mostly-positive readings push it toward the bottom', () => {
		const { y } = signedYScale([-8, 45, 61], 300);
		// A tenth of the span is deficit, so zero sits in the bottom fifth of the plot.
		expect(y(0)).toBeGreaterThan(240);
		expect(y(0)).toBeLessThan(300);
	});

	it('lifts zero toward the top when the deficits are the big numbers', () => {
		const { y } = signedYScale([-61, -45, 8], 300);
		expect(y(0)).toBeGreaterThan(0);
		expect(y(0)).toBeLessThan(60);
	});

	it('centres zero when both sides reach equally far', () => {
		const { y } = signedYScale([-50, 50], 300);
		expect(y(0)).toBeCloseTo(150, 6);
	});

	it('leaves headroom past the extremes, so a bar never touches the ceiling', () => {
		const { y } = signedYScale([-20, 80], 300);
		expect(y.domain()[0]).toBeLessThan(-20);
		expect(y.domain()[1]).toBeGreaterThan(80);
	});

	// The rounding `moneyYScale` applies would turn a 1% dip into a fifth of the plot.
	it('does not round the bounds outward', () => {
		const { y } = signedYScale([-1, 60], 300);
		expect(y.domain()[0]).toBeGreaterThan(-10);
	});

	it('anchors at zero when nothing is negative', () => {
		const { y } = signedYScale([10, 40], 300);
		expect(y.domain()[0]).toBe(0);
		expect(y(0)).toBe(300);
	});
});

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

	it('rounds the top outward when nothing caps it', () => {
		// `.nice()` lifts 3.6M to 4M, so the tallest reading sits below the top edge.
		expect(moneyYScale([0, 3_600_000], 300).y(3_600_000)).toBeGreaterThan(0);
	});

	/**
	 * Bug: a chart capped at a chosen level had `.nice()` round the ceiling up, leaving a dead band above
	 * lines that were already clipped — so the plot stopped short of where the frame said it did.
	 */
	it('puts a capped top exactly at the top edge', () => {
		const { y, ticks } = moneyYScale([0, 3_600_000], 300, 3_600_000);
		expect(y(3_600_000)).toBe(0);
		expect(y(0)).toBe(300);
		// Gridlines stay on round numbers, and none is drawn above the cap.
		expect(Math.max(...ticks)).toBeLessThanOrEqual(3_600_000);
	});

	it('keeps the cap even when the data falls well short of it', () => {
		expect(moneyYScale([0, 100], 300, 1_000_000).y(1_000_000)).toBe(0);
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
		// A narrow box, where a plain stride would place one label right beside the final one.
		const shown = labelIndices(9, 300, dates(9));
		const [secondLast, last] = shown.slice(-2);
		expect(last! - secondLast!).toBeGreaterThan(1);
	});

	/**
	 * Bug: a 70-point axis of 4-char years printed 2092 over 2095. The stride placed a label three slots
	 * from the end where each needed six, and the old guard only dropped a neighbour closer than HALF a
	 * stride — so it kept both. The room a label needs is a pixel measurement, not a fraction of a stride.
	 */
	it('keeps every drawn label at least its own width apart on a long axis', () => {
		const years = Array.from({ length: 70 }, (_, i) => String(2026 + i));
		const innerWidth = 592;
		const shown = labelIndices(70, innerWidth, years);
		const room = 4 * 6.2 + 12;

		for (let i = 1; i < shown.length; i++) {
			const gap = ((shown[i]! - shown[i - 1]!) * innerWidth) / 69;
			expect(gap, `${years[shown[i - 1]!]} to ${years[shown[i]!]}`).toBeGreaterThanOrEqual(room);
		}
		expect(shown.at(-1)).toBe(69);
	});

	it('handles degenerate series', () => {
		expect(labelIndices(0, 500, [])).toEqual([]);
		expect(labelIndices(1, 500, ['2026-01-01'])).toEqual([0]);
	});
});

describe('fitFontSize', () => {
	it('shrinks to fit a long label in a tight gutter', () => {
		const tight = fitFontSize(60, ['Tax-advantaged:BrokerageAIndividual']);
		const roomy = fitFontSize(200, ['Tax-advantaged:BrokerageAIndividual']);
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
