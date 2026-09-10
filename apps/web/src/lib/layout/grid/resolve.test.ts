import { describe, expect, it } from 'vitest';
import {
	assertNoOverlap,
	authoredY,
	boardRows,
	clampRect,
	firstOverlap,
	overlaps,
	resolve,
	sharesColumns
} from '$lib/layout/grid/resolve';
import { COLS, MIN_H, MIN_W } from '$lib/layout/grid/units';
import type { SizedPane } from '$lib/layout/grid/types';

/** Terse pane literal: id at (x,y) spanning w×h. */
const p = (id: string, x: number, y: number, w: number, h: number): SizedPane => ({
	id,
	x,
	y,
	w,
	h
});

const at = (placed: { id: string; y: number }[], id: string) => placed.find((q) => q.id === id)!.y;

describe('column overlap', () => {
	it('shares columns when the spans intersect, not when they abut', () => {
		expect(sharesColumns(p('a', 0, 0, 24, 4), p('b', 12, 9, 24, 4))).toBe(true);
		expect(sharesColumns(p('a', 0, 0, 24, 4), p('b', 24, 0, 24, 4))).toBe(false);
	});

	it('needs both axes to call it an overlap', () => {
		expect(overlaps(p('a', 0, 0, 24, 4), p('b', 0, 4, 24, 4))).toBe(false);
		expect(overlaps(p('a', 0, 0, 24, 4), p('b', 0, 3, 24, 4))).toBe(true);
	});
});

describe('resolve', () => {
	it('leaves a board with no collisions exactly where it was authored', () => {
		const placed = resolve([p('a', 0, 0, 24, 6), p('b', 24, 0, 24, 6), p('c', 0, 6, 48, 4)]);
		expect(placed.map((q) => q.offset)).toEqual([0, 0, 0]);
	});

	it('pushes a pane down by the overlap when the one above grows', () => {
		// The pane above outgrew what it was authored at: the one below moves by the overlap only.
		const placed = resolve([p('a', 0, 0, 48, 6), p('b', 0, 4, 48, 4)]);
		expect(at(placed, 'b')).toBe(6);
		expect(placed.find((q) => q.id === 'b')!.offset).toBe(2);
	});

	it('preserves a gap the user left', () => {
		const placed = resolve([p('a', 0, 0, 48, 6), p('b', 0, 12, 48, 4)]);
		expect(at(placed, 'b')).toBe(12);
	});

	it('takes the MAXIMUM of two growers reaching the same pane, not the sum', () => {
		// Both halves of the row grew from 4 to 6. The pane below must move 2, not 4.
		const placed = resolve([p('l', 0, 0, 24, 6), p('r', 24, 0, 24, 6), p('below', 0, 4, 48, 4)]);
		expect(at(placed, 'below')).toBe(6);
	});

	it('cascades on into panes only the displaced one touches', () => {
		// `wide` is pushed down by `tall`, and carries `under` — which `tall` never touches — with it.
		const placed = resolve([
			p('tall', 0, 0, 12, 10),
			p('wide', 0, 6, 48, 4),
			p('under', 36, 10, 12, 4)
		]);
		expect(at(placed, 'wide')).toBe(10);
		expect(at(placed, 'under')).toBe(14);
	});

	it('floors a rising pane on the neighbour that did NOT shrink', () => {
		// One half of the row shrank and the other did not, so `below` may only rise to the taller
		// one's bottom — any further and it slides underneath it.
		const placed = resolve([p('l', 0, 0, 24, 3), p('r', 24, 0, 24, 6), p('below', 0, 4, 48, 4)]);
		expect(at(placed, 'below')).toBe(6);
	});

	it('never moves a pane above its authored top', () => {
		const placed = resolve([p('a', 0, 0, 48, 2), p('b', 0, 20, 48, 4)]);
		expect(at(placed, 'b')).toBe(20);
	});

	it('lets a pane dropped onto its neighbour win, and pushes the neighbour below', () => {
		// Priority order: the dragged pane is first (the state layer promotes it). Both authored at
		// the same top, in the same columns.
		const placed = resolve([p('dragged', 0, 0, 24, 6), p('neighbour', 0, 0, 24, 6)]);
		expect(at(placed, 'dragged')).toBe(0);
		expect(at(placed, 'neighbour')).toBe(6);
	});

	it('still lets a pane authored higher win, whatever the priority order says', () => {
		const placed = resolve([p('dragged', 0, 4, 24, 6), p('above', 0, 0, 24, 6)]);
		expect(at(placed, 'above')).toBe(0);
		expect(at(placed, 'dragged')).toBe(6);
	});

	it('returns panes in the caller order, not the resolution order', () => {
		const placed = resolve([p('late', 0, 8, 48, 4), p('early', 0, 0, 48, 4)]);
		expect(placed.map((q) => q.id)).toEqual(['late', 'early']);
	});

	it('never renders an overlap, however tangled the input', () => {
		// Every pane authored on top of every other, in the same columns.
		const stack = Array.from({ length: 6 }, (_, i) => p(`p${i}`, 0, 0, 48, 5));
		const placed = resolve(stack);
		expect(firstOverlap(placed)).toBeNull();
		expect(placed.map((q) => q.y)).toEqual([0, 5, 10, 15, 20, 25]);
	});

	it('resolves a board where raising one pane brings it into a new collision', () => {
		// `c` clears `b` where it was authored, and only meets it once `a` has pushed `b` down.
		const placed = resolve([p('a', 0, 0, 12, 8), p('b', 0, 4, 12, 4), p('c', 0, 10, 12, 4)]);
		expect(at(placed, 'b')).toBe(8);
		expect(at(placed, 'c')).toBe(12);
		assertNoOverlap(placed);
	});

	it('reports the board height', () => {
		expect(boardRows(resolve([p('a', 0, 0, 24, 6), p('b', 24, 10, 24, 4)]))).toBe(14);
	});
});

describe('assertNoOverlap', () => {
	it('names both panes when the invariant breaks', () => {
		const bad = [
			{ id: 'a', x: 0, y: 0, w: 24, h: 6, offset: 0 },
			{ id: 'b', x: 0, y: 2, w: 24, h: 6, offset: 0 }
		];
		expect(() => assertNoOverlap(bad)).toThrow(/board overlap: a .* vs b /);
	});
});

describe('authoredY — the drag round-trip', () => {
	it('subtracts the displacement the pane was carrying', () => {
		expect(authoredY(6, 2)).toBe(4);
	});

	it('a drag that moves nothing changes nothing, so the pane cannot jump', () => {
		// The pane is authored at 4 and rendered at 6 because something above it grew. Drop it where
		// it already is: the stored top must come back as 4, or the next render applies the push
		// again and the pane leaves the pointer behind.
		const pushed = resolve([p('a', 0, 0, 48, 6), p('b', 0, 4, 48, 4)]);
		const b = pushed.find((q) => q.id === 'b')!;
		expect(b.y).toBe(6);
		expect(authoredY(b.y, b.offset)).toBe(4);

		// And re-resolving from that stored top reproduces the same screen position.
		const again = resolve([p('a', 0, 0, 48, 6), p('b', 0, authoredY(b.y, b.offset), 48, 4)]);
		expect(at(again, 'b')).toBe(6);
	});

	it('applies a downward drag once, not once per render', () => {
		// `b` is resting below where it was authored, pushed there by `a`. Dragging it down stores the
		// travel and renders at the same place — the push is not added again on top of the drag.
		const pushed = resolve([p('a', 0, 0, 48, 6), p('b', 0, 4, 48, 4)]);
		const b = pushed.find((q) => q.id === 'b')!;
		const stored = authoredY(b.y + 4, b.offset);
		expect(stored).toBe(8);
		expect(at(resolve([p('a', 0, 0, 48, 6), p('b', 0, stored, 48, 4)]), 'b')).toBe(8);
	});

	it('absorbs a downward drag that only takes up the slack it was already pushed by', () => {
		// The accepted consequence of subtracting the offset: `b` is authored above where it rests, so a
		// downward drag first closes that gap in the STORED position, without moving the pane.
		const pushed = resolve([p('a', 0, 0, 48, 6), p('b', 0, 4, 48, 4)]);
		const b = pushed.find((q) => q.id === 'b')!;
		const stored = authoredY(b.y + 2, b.offset);
		expect(stored).toBe(6);
		expect(at(resolve([p('a', 0, 0, 48, 6), p('b', 0, stored, 48, 4)]), 'b')).toBe(6);
	});

	it('cannot be dragged above the top of the board', () => {
		expect(authoredY(1, 4)).toBe(0);
	});
});

describe('clampRect', () => {
	it('holds a pane inside the board', () => {
		expect(clampRect({ x: 40, y: 0, w: 24, h: 6 }).x).toBe(COLS - 24);
		expect(clampRect({ x: -5, y: -5, w: 24, h: 6 })).toMatchObject({ x: 0, y: 0 });
	});

	it('applies the universal floor', () => {
		expect(clampRect({ x: 0, y: 0, w: 1, h: 1 })).toMatchObject({ w: MIN_W, h: MIN_H });
	});

	it('never lets a pane be wider than the board', () => {
		expect(clampRect({ x: 0, y: 0, w: 99, h: 4 })).toMatchObject({ x: 0, w: COLS });
	});
});
