import { describe, it, expect } from 'vitest';
import {
	halfLabelWidth,
	labelAnchor,
	markedIndices,
	xLabelLayout,
	moneyAxisFormat,
	moneyYScale,
	signedYScale
} from './axis';

describe('moneyAxisFormat', () => {
	it('abbreviates once every tick worth abbreviating clears a thousand', () => {
		const fmt = moneyAxisFormat([0, 100000, 200000, 300000]);
		expect(fmt(200000)).toBe('$200k');
	});

	it('stays exact where any tick is under a thousand', () => {
		const fmt = moneyAxisFormat([0, 250, 500, 750]);
		expect(fmt(500)).toBe('$500');
	});

	// Zero sits on almost every money axis, so holding it to the threshold would leave every axis exact.
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
		// `.nice()` rounds the domain top up, so the tallest reading sits below the top edge.
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

describe('xLabelLayout', () => {
	const evenly = (n: number, width: number) =>
		Array.from({ length: n }, (_, i) => (n > 1 ? (i * width) / (n - 1) : width / 2));
	const names = (n: number) => Array.from({ length: n }, (_, i) => `Mon ${2020 + i}`);

	it('lays labels flat where every one fits', () => {
		expect(xLabelLayout(evenly(4, 900), names(4), true).angle).toBe(0);
	});

	it('turns labels that would overlap, and grows the room below the plot to hold them', () => {
		const flat = xLabelLayout(evenly(4, 900), names(4), true);
		const turned = xLabelLayout(evenly(24, 600), names(24), true);
		expect(turned.angle).toBe(45);
		expect(turned.bottom).toBeGreaterThan(flat.bottom);
	});

	it('stands labels upright once even a slant would collide', () => {
		expect(xLabelLayout(evenly(80, 600), names(80), true).angle).toBe(90);
	});

	// Bug: the first label is anchored at its start, so it reaches a whole width right, where the next,
	// centred, reaches half a width back: a gap that fits two centred labels still overlaps these two.
	it('measures the inward-anchored end labels as they are drawn', () => {
		const xs = [0, 70, 140, 210];
		const labels = names(4);
		expect(xLabelLayout(xs, labels, false).angle).toBe(0);
		expect(xLabelLayout(xs, labels, true).angle).not.toBe(0);
	});

	it('lays a lone label flat', () => {
		expect(xLabelLayout([0], ['2026'], true).angle).toBe(0);
	});
});

describe('labelAnchor', () => {
	it('anchors the ends inward, so no label hangs outside the plot', () => {
		expect(labelAnchor(0, 5)).toBe('start');
		expect(labelAnchor(4, 5)).toBe('end');
	});

	it('centres everything in between', () => {
		expect(labelAnchor(2, 5)).toBe('middle');
	});

	it('centres a lone label, which is not against either edge', () => {
		expect(labelAnchor(0, 1)).toBe('middle');
	});
});

describe('halfLabelWidth', () => {
	it('grows with the text, so a longer figure is held further from the edge', () => {
		expect(halfLabelWidth('$1k')).toBeLessThan(halfLabelWidth('-$123,456'));
	});

	it('reaches nothing at all for an empty label', () => {
		expect(halfLabelWidth('')).toBe(0);
	});
});

describe('markedIndices', () => {
	it('marks every point whose period falls in the mark', () => {
		expect(
			markedIndices(
				['Aug 1', 'Aug 26', 'Sep 1'],
				['2026-08-01', '2026-08-26', '2026-09-01'],
				'2026-08'
			)
		).toEqual([0, 1]);
	});

	it('marks by label on an axis without periods', () => {
		expect(markedIndices(['Jan', 'Feb'], undefined, 'Feb')).toEqual([1]);
	});

	it('marks nothing without a mark', () => {
		expect(markedIndices(['Jan'], undefined)).toEqual([]);
	});
});
