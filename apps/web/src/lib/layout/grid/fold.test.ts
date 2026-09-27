import { describe, expect, it } from 'vitest';
import { foldSpan, readingOrder, stackColumns } from '$lib/layout/grid/fold';
import {
	foldMode,
	foldColumns,
	COLS,
	CONTENT,
	MIN_SCALE,
	ONE_COLUMN
} from '$lib/layout/grid/units';
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
	it('is full only when the whole content column fits, then scaled down to its least scale', () => {
		expect(foldMode(CONTENT)).toBe('full');
		expect(foldMode(CONTENT - 1)).toBe('scaled');
		expect(foldMode(Math.floor(CONTENT * MIN_SCALE) - 1)).toBe('two');
	});

	it('folds to one column at the one-column width and below', () => {
		expect(foldMode(ONE_COLUMN)).toBe('one');
		expect(foldMode(ONE_COLUMN + 1)).toBe('two');
	});

	it('maps each mode to its column count', () => {
		expect(foldColumns('full')).toBe(COLS);
		expect(foldColumns('two')).toBe(2);
		expect(foldColumns('one')).toBe(1);
	});
});

describe('stackColumns', () => {
	const pane = (id: string, rows: number, span = 1) => ({ id, span, rows });

	it('tops up the shorter column, so a short pane never waits beside a tall one', () => {
		const at = stackColumns([pane('tall', 30), pane('a', 10), pane('b', 10), pane('c', 10)], 2);
		expect(at.tall).toEqual({ col: 0, row: 0, rows: 30, span: 1 });
		expect(at.a).toMatchObject({ col: 1, row: 0 });
		expect(at.b).toMatchObject({ col: 1, row: 10 });
		expect(at.c).toMatchObject({ col: 1, row: 20 });
	});

	it('starts a full-width pane below both columns, stretching the shorter one level first', () => {
		const at = stackColumns(
			[pane('a', 12), pane('b', 20), pane('wide', 8, 2), pane('c', 5), pane('d', 9)],
			2
		);
		expect(at.a).toEqual({ col: 0, row: 0, rows: 20, span: 1 });
		expect(at.wide).toEqual({ col: 0, row: 20, rows: 8, span: 2 });
		expect(at.c).toMatchObject({ col: 0, row: 28, rows: 9 });
		expect(at.d).toMatchObject({ col: 1, row: 28, rows: 9 });
	});

	it('gives a pane with no neighbour between full-width ones the whole width', () => {
		const at = stackColumns([pane('alone', 10), pane('wide', 8, 2), pane('last', 6)], 2);
		expect(at.alone).toEqual({ col: 0, row: 0, rows: 10, span: 2 });
		expect(at.last).toEqual({ col: 0, row: 18, rows: 6, span: 2 });
	});

	it('leaves every column ending on the same row', () => {
		const at = stackColumns([pane('a', 7), pane('b', 3), pane('c', 11), pane('d', 2)], 2);
		const bottoms = [0, 1].map((c) =>
			Math.max(
				...Object.values(at)
					.filter((s) => s.col === c)
					.map((s) => s.row + s.rows)
			)
		);
		expect(bottoms[0]).toBe(bottoms[1]);
	});

	it('prefers the left column when both are level', () => {
		expect(stackColumns([pane('a', 4), pane('b', 4)], 2).b!.col).toBe(1);
		expect(stackColumns([pane('a', 4), pane('b', 4), pane('c', 4)], 2).c!.col).toBe(0);
	});
});
