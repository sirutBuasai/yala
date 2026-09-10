// What a drag adds to the push rule: it shoves whatever it is touching in the direction it is going,
// nothing else moves at all, and only travel that could not be absorbed — which is only ever upward —
// changes places with the pane above. Pure, so every case is an authored board in and an authored board
// out, plus what `resolve` then puts on screen.

import { describe, expect, it } from 'vitest';
import { lift, type DragOrigin } from '$lib/layout/grid/lift';
import { resolve } from '$lib/layout/grid/resolve';
import type { AuthoredPane, SizedPane } from '$lib/layout/grid/types';

/** Terse authored pane: id at (x,y) spanning w×h. */
const p = (id: string, x: number, y: number, w: number, h: number): AuthoredPane => ({
	id,
	x,
	y,
	w,
	h,
	mode: 'fixed',
	cap: h
});

const sized = (panes: AuthoredPane[]): SizedPane[] =>
	panes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));

const tops = (panes: { id: string; y: number }[]) =>
	Object.fromEntries(panes.map((q) => [q.id, q.y]));

/** The board as a press finds it: authored panes in priority order, and the same resolved. */
function origin(authored: AuthoredPane[]): DragOrigin {
	return { authored, placed: resolve(sized(authored)) };
}

/** One pointer move: where `id` ends up authored, where the board then renders, and the new order. */
function drag(authored: AuthoredPane[], id: string, x: number, y: number) {
	const next = lift(id, x, y, origin(authored));
	return { authored: tops(next), placed: tops(resolve(sized(next))), order: next.map((q) => q.id) };
}

describe('pushing the stack up', () => {
	// Slack over `a`, and `b` resting on it.
	const stack = () => [p('a', 0, 3, 48, 6), p('b', 0, 9, 48, 6)];

	it('takes the pane above up into the space over it', () => {
		const { authored, placed } = drag(stack(), 'b', 0, 7);
		expect(authored).toMatchObject({ a: 1, b: 7 });
		expect(placed).toMatchObject({ a: 1, b: 7 });
	});

	it('pushes only as far as the pointer asked', () => {
		expect(drag(stack(), 'b', 0, 8).placed).toMatchObject({ a: 2, b: 8 });
	});

	it('stops when the stack is against the top of the board', () => {
		// More travel than there is slack: the remainder is refused, not borrowed from `a`'s own spot.
		expect(drag(stack(), 'b', 0, 3).placed).toMatchObject({ a: 0, b: 6 });
	});

	it('closes the slack directly above it before it pushes anything', () => {
		// `b` has slack of its own to rise through, so `a` does not move until that is gone.
		const board = [p('a', 0, 3, 48, 6), p('b', 0, 11, 48, 6)];
		expect(drag(board, 'b', 0, 10).placed).toMatchObject({ a: 3, b: 10 });
		expect(drag(board, 'b', 0, 8).placed).toMatchObject({ a: 2, b: 8 });
	});

	it('takes a whole touching group up together', () => {
		const board = [p('l', 0, 2, 24, 6), p('r', 24, 2, 24, 6), p('wide', 0, 8, 48, 6)];
		expect(drag(board, 'wide', 0, 7).placed).toMatchObject({ l: 1, r: 1, wide: 7 });
	});

	it('refuses a group with any one pane against the top, rather than leaving it behind', () => {
		// `l` reaches the top, so the group is full even though `r` still has slack over it. Raising `r`
		// alone would slide `wide` under `l`.
		const board = [p('l', 0, 0, 24, 8), p('r', 24, 2, 24, 6), p('wide', 0, 8, 48, 6)];
		expect(drag(board, 'wide', 0, 7).placed).toMatchObject({ l: 0, r: 2, wide: 8 });
	});

	it('pushes whatever is above the columns the pointer has taken it to', () => {
		// Dragged up and to the right at once: there is slack in the left column, none in the right.
		const board = [p('l', 0, 3, 24, 6), p('r', 24, 0, 24, 12), p('pane', 0, 12, 24, 6)];
		const { authored } = drag(board, 'pane', 24, 9);
		expect(authored.pane).toBe(12);
		expect(lift('pane', 24, 9, origin(board))[0]!.x).toBe(24);
	});

	it('leaves every pane below where it is, resting on it or not', () => {
		// `c` is stacked against `b` and `d` has slack under it. Neither is towed: the rise opens a gap
		// under `b` rather than taking the board with it.
		const board = [
			p('a', 0, 3, 48, 6),
			p('b', 0, 9, 48, 6),
			p('c', 0, 15, 24, 4),
			p('d', 24, 19, 24, 4)
		];
		const { authored, placed } = drag(board, 'b', 0, 7);

		expect(authored).toMatchObject({ a: 1, b: 7, c: 15, d: 19 });
		expect(placed).toMatchObject({ a: 1, b: 7, c: 15, d: 19 });
	});

	it('lets a pane that was only ever PUSHED here rise on its own', () => {
		// `b` is authored above where it rests, pushed down by `a`. When `a` rises, `b` comes back up to
		// the top it was authored at all along — `resolve` alone, with no authored top changing — and `c`
		// stays put, because nothing pushed it.
		const board = [p('a', 0, 12, 48, 9), p('b', 0, 15, 28, 14), p('c', 0, 35, 24, 10)];
		const { authored, placed } = drag(board, 'a', 0, 6);

		expect(authored).toMatchObject({ a: 6, b: 15, c: 35 });
		expect(placed).toMatchObject({ a: 6, b: 15, c: 35 });
	});

	it('moves a merged KPI card alone, and pushes only what it runs into', () => {
		// `kpi` is two cards joined across, so it spans both panes below it: `left` is stacked against it
		// and `right` was left a gap. Rising it takes neither; falling it takes only `left`.
		const board = [
			p('top', 0, 0, 48, 4),
			p('kpi', 0, 8, 32, 6),
			p('left', 0, 14, 16, 6),
			p('right', 16, 16, 16, 6)
		];

		expect(drag(board, 'kpi', 0, 5).placed).toMatchObject({ kpi: 5, left: 14, right: 16 });
		expect(drag(board, 'kpi', 0, 10).placed).toMatchObject({ kpi: 10, left: 16, right: 16 });
	});

	it('leaves the authored top of a pane it never touched alone', () => {
		const board = [p('a', 0, 2, 48, 10), p('b', 0, 6, 48, 4)];
		const { authored, placed } = drag(board, 'a', 0, 0);

		expect(authored).toMatchObject({ a: 0, b: 6 });
		expect(placed).toMatchObject({ a: 0, b: 10 });
	});
});

describe('pushing the panes below down', () => {
	it('takes the panes below down with it', () => {
		const board = [p('a', 0, 0, 48, 6), p('b', 0, 6, 48, 6)];
		const { authored, placed } = drag(board, 'a', 0, 4);

		expect(authored).toMatchObject({ a: 4, b: 10 });
		expect(placed).toMatchObject({ a: 4, b: 10 });
	});

	it('closes the slack below it before it pushes anything', () => {
		const board = [p('a', 0, 0, 48, 6), p('b', 0, 10, 48, 6)];
		expect(drag(board, 'a', 0, 4).placed).toMatchObject({ a: 4, b: 10 });
		expect(drag(board, 'a', 0, 6).placed).toMatchObject({ a: 6, b: 12 });
	});

	it('never changes places with a pane it is pushing, however far it goes', () => {
		// A pushed pane is authored where it comes to rest. Left where it was, the moment `a` passed it
		// `b` would win the slot on authored order and the two would flip — a swap nobody asked for.
		const board = [p('a', 0, 0, 48, 6), p('b', 0, 6, 48, 40)];
		expect(drag(board, 'a', 0, 7).placed).toMatchObject({ a: 7, b: 13 });
		expect(drag(board, 'a', 0, 20).placed).toMatchObject({ a: 20, b: 26 });
	});

	it('stores a pushed pane where it came to rest, displacement and all', () => {
		// `b` is authored above where it rests, pushed down by `a`. Store its own top plus the travel and
		// the push stays latent in the gap between the two, so `b` springs back up the moment `a` moves
		// away — following a drag it was never part of.
		const board = [p('a', 0, 2, 48, 10), p('b', 0, 6, 48, 4)];
		const { authored, placed } = drag(board, 'a', 0, 5);

		expect(authored).toMatchObject({ a: 5, b: 15 });
		expect(placed).toMatchObject({ a: 5, b: 15 });
	});
});

describe('changing places', () => {
	const pair = () => [p('a', 0, 0, 48, 10), p('b', 0, 10, 48, 10)];

	it('waits until the drag has cleared the whole pane above', () => {
		// One row short: the stack cannot absorb the travel, and the swap has not earned it either.
		expect(drag(pair(), 'b', 0, 1).placed).toMatchObject({ a: 0, b: 10 });

		const { authored, placed, order } = drag(pair(), 'b', 0, 0);
		expect(authored.b).toBe(0);
		expect(placed).toMatchObject({ b: 0, a: 10 });
		// First in the priority order is how the board remembers who won, so a reload keeps the swap.
		expect(order[0]).toBe('b');
	});

	it('needs the whole height of a tall pane above, not half of it', () => {
		const board = [p('a', 0, 0, 48, 20), p('b', 0, 20, 48, 6)];
		expect(drag(board, 'b', 0, 11).placed).toMatchObject({ a: 0, b: 20 });
		expect(drag(board, 'b', 0, 0).placed).toMatchObject({ b: 0, a: 6 });
	});

	it('is undone by dragging back down, because every move re-derives from the press', () => {
		const at = origin(pair());
		expect(tops(resolve(sized(lift('b', 0, 0, at))))).toMatchObject({ b: 0, a: 10 });
		expect(tops(resolve(sized(lift('b', 0, 1, at))))).toMatchObject({ a: 0, b: 10 });
	});

	it('changes places with a pane of any width it shares a column with', () => {
		const board = [p('a', 0, 0, 48, 10), p('b', 0, 10, 12, 6)];
		expect(drag(board, 'b', 0, 0).placed).toMatchObject({ b: 0, a: 6 });
	});

	it('goes on over a second pane once it has cleared the first', () => {
		const board = [p('one', 0, 0, 48, 4), p('two', 0, 4, 48, 4), p('pane', 0, 8, 48, 4)];
		expect(drag(board, 'pane', 0, 4).placed).toMatchObject({ one: 0, pane: 4, two: 8 });
		expect(drag(board, 'pane', 0, 0).placed).toMatchObject({ pane: 0, one: 4, two: 8 });
	});

	it('leaves the pane below where it is, since the pane it swapped with fills the rows it left', () => {
		const board = [p('a', 0, 0, 48, 10), p('b', 0, 10, 48, 10), p('c', 0, 20, 48, 6)];
		const { authored, placed } = drag(board, 'b', 0, 0);

		expect(authored).toMatchObject({ b: 0, a: 0, c: 20 });
		expect(placed).toMatchObject({ b: 0, a: 10, c: 20 });
	});
});

describe('guards', () => {
	it('hands the board back untouched for a pane it does not hold', () => {
		const board = [p('a', 0, 0, 48, 6)];
		expect(lift('nope', 0, 20, origin(board))).toBe(board);
	});

	it('keeps the dragged pane inside the board', () => {
		const board = [p('a', 0, 0, 24, 6)];
		expect(drag(board, 'a', 40, -5).authored).toMatchObject({ a: 0 });
		expect(lift('a', 40, -5, origin(board))[0]!.x).toBe(24);
	});
});
