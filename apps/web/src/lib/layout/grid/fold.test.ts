import { describe, expect, it } from 'vitest';
import { foldSpan, readingOrder } from '$lib/layout/grid/fold';
import { foldMode, foldColumns, COLS, CONTENT, ONE_COLUMN } from '$lib/layout/grid/units';
import type { PlacedPane } from '$lib/layout/grid/types';

const q = (id: string, x: number, y: number, w = 24, h = 6): PlacedPane => ({
	id,
	x,
	y,
	w,
	h,
	offset: 0
});

describe('readingOrder', () => {
	it('reads top to bottom, then left to right', () => {
		const order = readingOrder([q('c', 0, 6), q('b', 24, 0), q('a', 0, 0)]);
		expect(order).toEqual({ a: 0, b: 1, c: 2 });
	});

	it('sequences the FOLDED layout from the arrangement, not from the markup', () => {
		// A tall left pane beside two stacked right ones: folding must give left, top-right,
		// bottom-right — the arrangement's reading order — whatever order the view declared them in.
		const order = readingOrder([
			q('lower-right', 24, 8),
			q('left', 0, 0, 24, 16),
			q('upper-right', 24, 0, 24, 8)
		]);
		expect(order).toEqual({ left: 0, 'upper-right': 1, 'lower-right': 2 });
	});
});

describe('foldSpan', () => {
	it('gives a pane that took more than half the board the full folded width', () => {
		expect(foldSpan(COLS, 2)).toBe(2);
		expect(foldSpan(COLS / 2 + 1, 2)).toBe(2);
	});

	it('leaves a half-width or narrower pane in one column', () => {
		expect(foldSpan(COLS / 2, 2)).toBe(1);
		expect(foldSpan(12, 2)).toBe(1);
	});

	it('is always one column in a single-column board', () => {
		expect(foldSpan(COLS, 1)).toBe(1);
	});
});

describe('foldMode', () => {
	it('is full only when the whole content column fits', () => {
		expect(foldMode(CONTENT)).toBe('full');
		expect(foldMode(CONTENT - 1)).toBe('two');
	});

	it('folds to one column at 60rem and below', () => {
		expect(foldMode(ONE_COLUMN)).toBe('one');
		expect(foldMode(ONE_COLUMN + 1)).toBe('two');
	});

	it('maps each mode to its column count', () => {
		expect(foldColumns('full')).toBe(COLS);
		expect(foldColumns('two')).toBe(2);
		expect(foldColumns('one')).toBe(1);
	});
});
