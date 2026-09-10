// The state layer, driven the way a gesture drives it. The pure math has its own tests; this covers
// the wiring — what gets persisted, what gets re-derived, and the round-trip a drag makes through
// storage.

import { beforeEach, describe, expect, it } from 'vitest';
import { Arrangement } from '$lib/layout/grid/arrangement.svelte';
import { GridEnv } from '$lib/layout/grid/env.svelte';
import { CONTENT, GAP, UNIT, WRAP_PAD } from '$lib/layout/grid/units';
import type { BoardLayout } from '$lib/layout/grid/types';

const LAYOUT = {
	tall: { x: 0, y: 0, w: 24, h: 12, content: 'scale' },
	top: { x: 24, y: 0, w: 24, h: 6, content: 'scale' },
	bottom: { x: 24, y: 6, w: 24, h: 6, content: 'flow', mode: 'fit' },
	wide: { x: 0, y: 12, w: 48, h: 8, content: 'flow', mode: 'cap', cap: 8 }
} satisfies BoardLayout;

/** A full-width environment, so the board is not folded. */
function wideEnv(): GridEnv {
	const env = new GridEnv();
	env.width = CONTENT + 2 * WRAP_PAD;
	return env;
}

/** Card pixels for `n` units of grid, so a measurement lands on a whole row. */
const rows = (n: number) => n * UNIT - GAP;

let seq = 0;
/** A board on a key nothing else has used, so one test's storage can't reach another's. */
function arrangement(env = wideEnv()) {
	return { arrangement: new Arrangement(`test-${seq++}`, LAYOUT, env), env };
}

beforeEach(() => localStorage.clear());

describe('defaults', () => {
	it('starts on the arrangement the view declared', () => {
		const { arrangement: b } = arrangement();
		expect(b.placed('tall')).toMatchObject({ x: 0, y: 0, w: 24, h: 12, offset: 0 });
		expect(b.placed('wide')).toMatchObject({ x: 0, y: 12, w: 48, h: 8 });
	});

	it('forces a chart pane to a fixed height, whatever the view asked for', () => {
		const { arrangement: b } = arrangement();
		expect(b.mode('tall')).toBe('fixed');
		expect(b.canSetHeight('tall')).toBe(false);
		expect(b.canSetHeight('bottom')).toBe(true);
	});

	it('throws for a pane the layout does not declare, naming it', () => {
		const { arrangement: b } = arrangement();
		expect(() => b.spec('nope')).toThrow(/pane "nope"/);
	});
});

describe('fitted panes', () => {
	it('reserves what the card measured', () => {
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(10));
		expect(b.placed('bottom').h).toBe(10);
	});

	it('pushes the panes below it down as it grows, and lets them back up as it shrinks', () => {
		const { arrangement: b } = arrangement();

		b.setMeasured('bottom', rows(14)); // top(6) + bottom(14) = 20, past `wide`'s top at 12
		expect(b.placed('wide').y).toBe(20);

		b.setMeasured('bottom', rows(6)); // back to where it was authored
		expect(b.placed('wide').y).toBe(12);
	});

	it('floors a rising pane on the neighbour that did not shrink', () => {
		const { arrangement: b } = arrangement();
		// `tall` is 12 and did not move. Even with the right-hand column collapsed, `wide` may not rise
		// above `tall`'s bottom — that is the trap a remembered offset would fall into.
		b.setMeasured('bottom', rows(1));
		expect(b.placed('wide').y).toBe(12);
	});

	it('holds a capped pane open to its whole ceiling while arranging, and not otherwise', () => {
		const { arrangement: b, env } = arrangement();
		b.setMeasured('wide', rows(3));

		expect(b.placed('wide').h).toBe(3);
		env.arrangeRequested = true;
		expect(b.placed('wide').h).toBe(8);
	});
});

describe('drop', () => {
	it('stores where the pane was dropped when it was carrying no displacement', () => {
		const { arrangement: b } = arrangement();
		b.drop('top', 24, 4, 0);
		expect(b.placed('top').y).toBe(4);
	});

	it('subtracts the displacement, so a drop that moves nothing changes nothing', () => {
		const { arrangement: b } = arrangement();
		// Grow `bottom` so `wide` is pushed 8 rows below where it was authored.
		b.setMeasured('bottom', rows(14));
		const before = b.placed('wide');
		expect(before.offset).toBe(8);

		// Pick it up and put it back down in the same place, as a gesture with zero delta does.
		b.drop('wide', before.x, before.y, before.offset);

		expect(b.placed('wide').y).toBe(before.y);
		expect(b.authored('wide').y).toBe(12); // the authored top is untouched
	});

	it('applies a drag once, not once per render', () => {
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(14));
		const before = b.placed('wide'); // authored at 12, resting at 20 (offset 8)

		b.drop('wide', before.x, before.y + 12, before.offset);

		// The push is not added a second time on top of the drag.
		expect(b.authored('wide').y).toBe(24);
		expect(b.placed('wide').y).toBe(24);

		// And it stays there across a re-derive.
		b.setMeasured('bottom', rows(14));
		expect(b.placed('wide').y).toBe(24);
	});

	it('absorbs a downward drag that only takes up the slack the pane was pushed by', () => {
		// The accepted consequence of subtracting the offset: a downward drag first closes the slack the
		// pane was pushed by, in the STORED position, without moving it. Storing where it was dropped
		// instead would re-baseline the pane onto a push it never asked for.
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(14));
		const before = b.placed('wide');

		b.drop('wide', before.x, before.y + 4, before.offset);

		expect(b.authored('wide').y).toBe(16);
		expect(b.placed('wide').y).toBe(20);
	});

	it('keeps a dropped pane inside the board', () => {
		const { arrangement: b } = arrangement();
		b.drop('top', 40, 0, 0); // a 24-wide pane cannot start at column 40
		expect(b.authored('top').x).toBe(24);
		b.drop('top', -5, -5, 0);
		// The stored pane is clamped to the origin. Where it RENDERS is another matter: `tall` already
		// holds that corner, so the push rule sends this pane below it.
		expect(b.authored('top')).toMatchObject({ x: 0, y: 0 });
		expect(b.placed('top').y).toBe(12);
	});

	it('lets the pane just dropped win its spot, pushing its neighbour below', () => {
		const { arrangement: b } = arrangement();
		b.promote('top'); // what `Pane` does at the start of a move
		b.drop('top', 0, 0, 0); // straight onto `tall`

		expect(b.placed('top').y).toBe(0);
		expect(b.placed('tall').y).toBe(6);
	});

	it('and still wins after a reload, because the priority order is stored too', () => {
		const env = wideEnv();
		const key = `test-reload-${seq++}`;
		const first = new Arrangement(key, LAYOUT, env);
		first.promote('top');
		first.drop('top', 0, 0, 0);
		first.commit();

		const reopened = new Arrangement(key, LAYOUT, env);
		expect(reopened.placed('top').y).toBe(0);
		expect(reopened.placed('tall').y).toBe(6);
	});
});

describe('resize', () => {
	it('sets the height on a fixed pane', () => {
		const { arrangement: b } = arrangement();
		b.resizeTo('tall', { x: 0, y: 0, w: 24, h: 20 });
		expect(b.placed('tall').h).toBe(20);
	});

	it('sets the CEILING on a capped pane, and leaves its own height alone', () => {
		const { arrangement: b } = arrangement();
		b.setMeasured('wide', rows(4));

		b.resizeTo('wide', { x: 0, y: 12, w: 48, h: 16 });

		expect(b.authored('wide').cap).toBe(16);
		// Storing the ceiling AS the height would re-baseline the pane, and a capped list that has not
		// reached its ceiling would read as having shrunk.
		expect(b.authored('wide').h).toBe(8);
		expect(b.placed('wide').h).toBe(4);
	});
});

describe('height modes', () => {
	it('freezes the height at what the content needs when leaving a fitted mode', () => {
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(9));

		b.setMode('bottom', 'fixed');

		expect(b.mode('bottom')).toBe('fixed');
		expect(b.placed('bottom').h).toBe(9);
	});

	it('seeds a new ceiling from the same figure, so the pane does not jump on the way in', () => {
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(9));
		b.setMode('bottom', 'cap');
		expect(b.authored('bottom').cap).toBe(9);
	});

	it('decides on its own whether the body scrolls', () => {
		const { arrangement: b } = arrangement();
		expect(b.scrolls('bottom')).toBe(false); // fitted: extends rather than scrolls
		b.setMode('bottom', 'fixed');
		expect(b.scrolls('bottom')).toBe(true);
		expect(b.scrolls('tall')).toBe(false); // a chart fills; it never scrolls
	});
});

describe('persistence', () => {
	it('writes only on commit, so a gesture is not one storage write per pointer move', () => {
		const env = wideEnv();
		const key = `test-commit-${seq++}`;
		const b = new Arrangement(key, LAYOUT, env);

		b.drop('top', 24, 20, 0);
		expect(new Arrangement(key, LAYOUT, env).placed('top').y).toBe(0);

		b.commit();
		expect(new Arrangement(key, LAYOUT, env).placed('top').y).toBe(20);
	});

	it('never stores displacement, so a saved board cannot drift as the data changes', () => {
		const env = wideEnv();
		const key = `test-drift-${seq++}`;
		const b = new Arrangement(key, LAYOUT, env);

		b.setMeasured('bottom', rows(14)); // pushes `wide` from 12 to 20
		expect(b.placed('wide').y).toBe(20);
		b.commit();

		// A fresh mount with no measurements yet puts `wide` back at its authored top. Had the push been
		// written, every reload would have kept it — and a double mount would have kept it twice.
		expect(new Arrangement(key, LAYOUT, env).authored('wide').y).toBe(12);
	});

	it('drops a stored pane the layout no longer declares', () => {
		const env = wideEnv();
		const key = `test-ghost-${seq++}`;
		localStorage.setItem(
			`yala-board-${key}`,
			JSON.stringify([{ id: 'retired', x: 0, y: 0, w: 24, h: 6, mode: 'fixed', cap: 6 }])
		);

		const b = new Arrangement(key, LAYOUT, env);
		expect(() => b.spec('retired')).toThrow();
		expect(b.placed('tall').y).toBe(0);
	});

	it('falls back to the declared default for a half-written entry', () => {
		const env = wideEnv();
		const key = `test-corrupt-${seq++}`;
		localStorage.setItem(
			`yala-board-${key}`,
			JSON.stringify([{ id: 'tall', x: 0, w: 24, h: 6, mode: 'fixed', cap: 6 }]) // no `y`
		);

		expect(new Arrangement(key, LAYOUT, env).placed('tall')).toMatchObject({ y: 0, h: 12 });
	});

	it('reset puts the declared arrangement back and clears what was stored', () => {
		const env = wideEnv();
		const key = `test-reset-${seq++}`;
		const b = new Arrangement(key, LAYOUT, env);

		b.drop('top', 24, 20, 0);
		b.commit();
		b.reset();

		expect(b.placed('top').y).toBe(0);
		expect(new Arrangement(key, LAYOUT, env).placed('top').y).toBe(0);
	});
});

describe('folding', () => {
	it('sequences the folded layout in the arrangement’s reading order', () => {
		const { arrangement: b } = arrangement();
		expect(b.order).toEqual({ tall: 0, top: 1, bottom: 2, wide: 3 });
	});

	it('stops reserving height and stops scrolling once folded', () => {
		const env = new GridEnv();
		env.width = 700;
		const { arrangement: b } = arrangement(env);

		expect(env.folded).toBe(true);
		expect(b.hugs('bottom')).toBe(false);
		expect(b.scrolls('wide')).toBe(false);
		expect(b.columns).toBe(1);
	});

	it('does not offer arranging when the full content width does not fit', () => {
		const env = new GridEnv();
		env.width = CONTENT; // short of the padding, so the content column is 48px narrow
		expect(env.canArrange).toBe(false);
		env.arrangeRequested = true;
		expect(env.arranging).toBe(false);
	});
});
