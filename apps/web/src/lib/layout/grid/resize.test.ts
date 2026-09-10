import { describe, expect, it } from 'vitest';
import { EDGES, moveRect, resizeRect, snapUnits } from '$lib/layout/grid/resize';
import { UNIT } from '$lib/layout/grid/units';
import type { Rect } from '$lib/layout/grid/types';

const base: Rect = { x: 10, y: 4, w: 12, h: 6 };

/** `n` units of travel, in px — the only way a caller ever produces a whole-unit delta. */
const px = (units: number) => units * UNIT;

describe('snapUnits', () => {
	it('snaps to the nearest lattice line, in either direction', () => {
		expect(snapUnits(px(3))).toBe(3);
		expect(snapUnits(px(-3))).toBe(-3);
		expect(snapUnits(0)).toBe(0);
	});

	it('turns over at half a unit — that is where the pane changes size', () => {
		expect(snapUnits(UNIT / 2 - 1)).toBe(0);
		expect(snapUnits(UNIT / 2)).toBe(1);
		expect(snapUnits(UNIT * 2 - 1)).toBe(2);
	});
});

describe('resizeRect', () => {
	it('e/s edges grow the pane and leave the origin alone', () => {
		expect(resizeRect(base, 'e', px(3), px(9))).toEqual({ x: 10, y: 4, w: 15, h: 6 });
		expect(resizeRect(base, 's', px(9), px(2))).toEqual({ x: 10, y: 4, w: 12, h: 8 });
	});

	it('the w edge moves x and w together — dragging it left widens the pane', () => {
		expect(resizeRect(base, 'w', px(-4), 0)).toEqual({ x: 6, y: 4, w: 16, h: 6 });
		expect(resizeRect(base, 'w', px(4), 0)).toEqual({ x: 14, y: 4, w: 8, h: 6 });
	});

	it('the n edge moves y and h together — dragging it up heightens the pane', () => {
		expect(resizeRect(base, 'n', 0, px(-2))).toEqual({ x: 10, y: 2, w: 12, h: 8 });
		expect(resizeRect(base, 'n', 0, px(2))).toEqual({ x: 10, y: 6, w: 12, h: 4 });
	});

	it('each corner applies both of its edges', () => {
		expect(resizeRect(base, 'se', px(2), px(3))).toEqual({ x: 10, y: 4, w: 14, h: 9 });
		expect(resizeRect(base, 'sw', px(2), px(3))).toEqual({ x: 12, y: 4, w: 10, h: 9 });
		expect(resizeRect(base, 'ne', px(2), px(3))).toEqual({ x: 10, y: 7, w: 14, h: 3 });
		expect(resizeRect(base, 'nw', px(2), px(3))).toEqual({ x: 12, y: 7, w: 10, h: 3 });
	});

	it('applies the delta cumulatively from the base, so the same delta gives the same rectangle', () => {
		// What makes dragging into a wall and back out again exact: nothing accumulates between calls.
		const once = resizeRect(base, 'se', px(2), px(2));
		expect(resizeRect(base, 'se', px(2), px(2))).toEqual(once);
		expect(resizeRect(base, 'se', 0, 0)).toEqual(base);
	});

	it('leaves the base untouched', () => {
		resizeRect(base, 'nw', px(5), px(5));
		expect(base).toEqual({ x: 10, y: 4, w: 12, h: 6 });
	});
});

describe('moveRect', () => {
	it('translates the rectangle and keeps its size', () => {
		expect(moveRect(base, px(-3), px(2))).toEqual({ x: 7, y: 6, w: 12, h: 6 });
	});

	it('is cumulative from the base too', () => {
		expect(moveRect(base, px(4), px(4))).toEqual(moveRect(base, px(4), px(4)));
		expect(moveRect(base, 0, 0)).toEqual(base);
	});
});

describe('EDGES', () => {
	it('a fixed pane owns both axes: all eight handles', () => {
		expect(EDGES.fixed).toEqual(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
	});

	it('a capped pane keeps the bottom edge, which sets the ceiling, but not the top', () => {
		expect(EDGES.cap).toEqual(['s', 'e', 'w', 'se', 'sw']);
	});

	it("a fitted pane has no vertical handle at all — its height is not the user's to set", () => {
		expect(EDGES.fit).toEqual(['e', 'w']);
	});

	it('never offers a handle that would not do something', () => {
		for (const edges of Object.values(EDGES)) {
			expect(edges).toEqual([...new Set(edges)]);
		}
		expect(EDGES.fit.some((e) => e.includes('n') || e.includes('s'))).toBe(false);
		expect(EDGES.cap.some((e) => e.includes('n'))).toBe(false);
	});
});
