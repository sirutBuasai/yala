import { describe, expect, it } from 'vitest';
import {
	boundsOf,
	dividerFractions,
	groupsFor,
	mergeAxis,
	mergeGroups,
	splitGroup,
	splitRects,
	unionRect,
	type KpiGroup
} from '$lib/kpi/merge';
import { MIN_H, MIN_W } from '$lib/layout/grid/units';
import type { Rect } from '$lib/layout/grid/types';

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Four cards in a row, then two stacked under the first — enough to exercise both axes. */
function board(): Record<string, Rect> {
	return {
		a: rect(0, 0, 12, 7),
		b: rect(12, 0, 12, 7),
		c: rect(24, 0, 12, 7),
		d: rect(36, 0, 12, 7),
		e: rect(0, 7, 12, 7)
	};
}

describe('mergeAxis', () => {
	it('joins two cards side by side that abut and share a height', () => {
		expect(mergeAxis(rect(0, 0, 12, 7), rect(12, 0, 12, 7))).toBe('row');
	});

	it('joins two stacked cards that abut and share a width', () => {
		expect(mergeAxis(rect(0, 0, 12, 7), rect(0, 7, 12, 7))).toBe('column');
	});

	it('refuses side-by-side cards of different heights', () => {
		expect(mergeAxis(rect(0, 0, 12, 7), rect(12, 0, 12, 9))).toBeNull();
	});

	it('refuses stacked cards of different widths', () => {
		expect(mergeAxis(rect(0, 0, 12, 7), rect(0, 7, 16, 7))).toBeNull();
	});

	it('refuses cards that match but do not touch', () => {
		expect(mergeAxis(rect(0, 0, 12, 7), rect(13, 0, 12, 7))).toBeNull();
	});

	it('refuses cards offset on the shared axis', () => {
		expect(mergeAxis(rect(0, 0, 12, 7), rect(12, 1, 12, 7))).toBeNull();
	});

	it('is directional — the left/upper card is the one offered the control', () => {
		expect(mergeAxis(rect(12, 0, 12, 7), rect(0, 0, 12, 7))).toBeNull();
	});
});

describe('groupsFor', () => {
	it('makes every KPI a card of its own when nothing is stored', () => {
		const groups = groupsFor(board(), []);
		expect(groups.map((g) => g.ids)).toEqual([['a'], ['b'], ['c'], ['d'], ['e']]);
	});

	it('orders cards top-left first, so the board is declared in reading order', () => {
		const stored: KpiGroup[] = [{ ids: ['c', 'd'], axis: 'row', weights: [12, 12] }];
		expect(groupsFor(board(), stored).map((g) => g.ids[0])).toEqual(['a', 'b', 'c', 'e']);
	});

	it('drops members the board no longer declares', () => {
		const stored: KpiGroup[] = [{ ids: ['a', 'b', 'gone'], axis: 'row', weights: [12, 12, 12] }];
		expect(groupsFor(board(), stored)[0]!.ids).toEqual(['a', 'b']);
	});

	it('dissolves a group left with one member', () => {
		const stored: KpiGroup[] = [{ ids: ['a', 'gone'], axis: 'row', weights: [12, 12] }];
		const groups = groupsFor(board(), stored);
		expect(groups.map((g) => g.ids)).toEqual([['a'], ['b'], ['c'], ['d'], ['e']]);
	});

	// A hand-edited or half-written stored group: a member repeated inside ONE group would render two
	// sections under the same key, which Svelte refuses outright.
	it('never lets one group claim the same KPI twice', () => {
		const stored: KpiGroup[] = [{ ids: ['a', 'a', 'b'], axis: 'row', weights: [12, 12, 12] }];
		const groups = groupsFor(board(), stored);
		expect(groups.find((g) => g.ids.includes('a'))!.ids).toEqual(['a', 'b']);
		expect(groups.flatMap((g) => g.ids)).toEqual([...new Set(groups.flatMap((g) => g.ids))]);
	});

	it('releases the members of a group that dissolved, so they are cards again', () => {
		const stored: KpiGroup[] = [
			{ ids: ['a', 'gone'], axis: 'row', weights: [12, 12] },
			{ ids: ['a', 'b'], axis: 'row', weights: [12, 12] }
		];
		// The first group is left with one member and dissolves; `a` must still be free for the second.
		expect(groupsFor(board(), stored).find((g) => g.ids[0] === 'a')!.ids).toEqual(['a', 'b']);
	});

	it('never lets two groups claim the same KPI', () => {
		const stored: KpiGroup[] = [
			{ ids: ['a', 'b'], axis: 'row', weights: [12, 12] },
			{ ids: ['b', 'c'], axis: 'row', weights: [12, 12] }
		];
		const groups = groupsFor(board(), stored);
		expect(groups.filter((g) => g.ids.includes('b'))).toHaveLength(1);
		expect(groups.map((g) => g.ids)).toEqual([['a', 'b'], ['c'], ['d'], ['e']]);
	});
});

describe('mergeGroups', () => {
	const spans: Record<string, number> = { a: 12, b: 12, c: 16, d: 12, e: 7 };
	const spanOf = (id: string) => spans[id]!;

	it('joins two singletons, keeping the first as the leader', () => {
		const groups = mergeGroups(groupsFor(board(), []), 'a', 'b', 'row', spanOf);
		const merged = groups.find((g) => g.ids[0] === 'a')!;
		expect(merged.ids).toEqual(['a', 'b']);
		expect(merged.axis).toBe('row');
		expect(merged.weights).toEqual([12, 12]);
	});

	it('keeps each section at the span its card had, so the merge changes no size', () => {
		const groups = mergeGroups(groupsFor(board(), []), 'b', 'c', 'row', spanOf);
		expect(groups.find((g) => g.ids[0] === 'b')!.weights).toEqual([12, 16]);
	});

	it('appends to an existing group without disturbing its section sizes', () => {
		const stored: KpiGroup[] = [{ ids: ['a', 'b'], axis: 'row', weights: [20, 4] }];
		const groups = mergeGroups(groupsFor(board(), stored), 'a', 'c', 'row', spanOf);
		const merged = groups.find((g) => g.ids[0] === 'a')!;
		expect(merged.ids).toEqual(['a', 'b', 'c']);
		expect(merged.weights).toEqual([20, 4, 16]);
	});

	it('leaves the groups alone when either side is not a leader', () => {
		const stored: KpiGroup[] = [{ ids: ['a', 'b'], axis: 'row', weights: [12, 12] }];
		const groups = groupsFor(board(), stored);
		expect(mergeGroups(groups, 'b', 'c', 'row', spanOf)).toBe(groups);
	});
});

describe('splitGroup', () => {
	const three: KpiGroup[] = [{ ids: ['a', 'b', 'c'], axis: 'row', weights: [12, 8, 16] }];

	it('splits at the divider, the right half led by the section after it', () => {
		const groups = splitGroup(three, 'a', 1);
		expect(groups.map((g) => g.ids)).toEqual([['b', 'c']]);
		expect(groups[0]!.weights).toEqual([8, 16]);
	});

	it('drops a half of one, which is a card again rather than a group', () => {
		const groups = splitGroup(three, 'a', 2);
		expect(groups.map((g) => g.ids)).toEqual([['a', 'b']]);
	});

	it('splits a pair into two cards', () => {
		const pair: KpiGroup[] = [{ ids: ['a', 'b'], axis: 'row', weights: [12, 12] }];
		expect(splitGroup(pair, 'a', 1)).toEqual([]);
	});

	it('ignores an index that names no divider', () => {
		expect(splitGroup(three, 'a', 0)).toBe(three);
		expect(splitGroup(three, 'a', 3)).toBe(three);
	});
});

describe('splitRects', () => {
	/** Content that fits in anything, so a case is only about the weights. */
	const roomy: [number, number] = [0, 0];

	it('divides the width by the share the sections held', () => {
		const group: KpiGroup = { ids: ['a', 'b'], axis: 'row', weights: [12, 36] };
		const [left, right] = splitRects(group, rect(0, 0, 48, 7), 1, roomy);
		expect(left).toEqual(rect(0, 0, 12, 7));
		expect(right).toEqual(rect(12, 0, 36, 7));
	});

	it('divides the height on a stacked card', () => {
		const group: KpiGroup = { ids: ['a', 'b'], axis: 'column', weights: [7, 7] };
		const [top, bottom] = splitRects(group, rect(0, 0, 12, 14), 1, roomy);
		expect(top).toEqual(rect(0, 0, 12, 7));
		expect(bottom).toEqual(rect(0, 7, 12, 7));
	});

	it('leaves both halves a legal rectangle, whatever the weights say', () => {
		// A hair-thin first section would otherwise be handed a width below the board's floor, which
		// storage then widens back over its neighbour.
		const row: KpiGroup = { ids: ['a', 'b'], axis: 'row', weights: [1, 99] };
		const [left, right] = splitRects(row, rect(0, 0, 2 * MIN_W, 7), 1, roomy);
		expect(left.w).toBe(MIN_W);
		expect(right.w).toBe(MIN_W);

		const col: KpiGroup = { ids: ['a', 'b'], axis: 'column', weights: [1, 99] };
		const [top, bottom] = splitRects(col, rect(0, 0, 12, 2 * MIN_H), 1, roomy);
		expect(top.h).toBe(MIN_H);
		expect(bottom.h).toBe(MIN_H);
		expect(bottom.y).toBe(MIN_H);
	});

	it('gives a half the span its content needs, not the share its weight asks for', () => {
		const group: KpiGroup = { ids: ['a', 'b'], axis: 'row', weights: [4, 20] };
		const [left, right] = splitRects(group, rect(0, 0, 24, 7), 1, [10, 8]);
		expect(left.w).toBe(10);
		expect(right).toEqual(rect(10, 0, 14, 7));
	});

	it('overlaps the second half when the card cannot fit both, rather than clipping either', () => {
		// The state a merged card left at its own minimum is in: splitting it costs a card's worth of
		// padding twice over, so the halves need more room than the card has.
		const group: KpiGroup = { ids: ['a', 'b'], axis: 'row', weights: [10, 10] };
		const [left, right] = splitRects(group, rect(0, 0, 20, 7), 1, [12, 12]);
		expect(left.w).toBe(12);
		expect(right).toEqual(rect(12, 0, 12, 7));
	});
});

describe('dividerFractions', () => {
	it('places a divider at each cumulative share of the axis', () => {
		expect(dividerFractions([1, 1])).toEqual([0.5]);
		expect(dividerFractions([1, 1, 2])).toEqual([0.25, 0.5]);
	});

	it('has no dividers on a card of one', () => {
		expect(dividerFractions([12])).toEqual([]);
	});
});

describe('geometry helpers', () => {
	it('unions two adjacent rectangles into the space both held', () => {
		expect(unionRect(rect(0, 0, 12, 7), rect(12, 0, 16, 7))).toEqual(rect(0, 0, 28, 7));
	});

	it('bounds a whole group, which is a merged card default position', () => {
		expect(boundsOf([rect(12, 7, 12, 7), rect(0, 0, 12, 7)])).toEqual(rect(0, 0, 24, 14));
	});
});
