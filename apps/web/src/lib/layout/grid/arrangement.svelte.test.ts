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

/** One whole drag, the way a gesture drives it: the board captured at the press, then a position in
    PLACED coordinates. */
const dragTo = (b: Arrangement, id: string, x: number, y: number) =>
	b.dragTo(id, x, y, b.beginDrag());

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
		// `tall` did not move, so however far the right-hand column collapses, `wide` may not rise above
		// `tall`'s bottom — the trap a remembered offset would fall into.
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

describe('dragging', () => {
	it('stores where the pane was dropped when it was carrying no displacement', () => {
		const { arrangement: b } = arrangement();
		dragTo(b, 'top', 24, 4);
		expect(b.placed('top').y).toBe(4);
	});

	it('stores a pushed pane where it sits, so it cannot spring back when the push goes', () => {
		const { arrangement: b } = arrangement();
		// Grow `bottom` so `wide` is pushed below where it was authored.
		b.setMeasured('bottom', rows(14));
		const before = b.placed('wide');
		expect(before.offset).toBe(8);

		// Pick it up and put it back down in the same place, as a gesture with zero delta does.
		dragTo(b, 'wide', before.x, before.y);
		expect(b.authored('wide').y).toBe(before.y);

		// The push it was carrying is its own top now: shrink `bottom` back and the pane stays where the
		// user last saw it, rather than rising into the space that opened.
		b.setMeasured('bottom', rows(6));
		expect(b.placed('wide').y).toBe(before.y);
	});

	it('applies a drag once, not once per render', () => {
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(14));
		const before = b.placed('wide'); // resting below where it was authored

		dragTo(b, 'wide', before.x, before.y + 12);

		// The push is not added a second time on top of the drag.
		expect(b.authored('wide').y).toBe(32);
		expect(b.placed('wide').y).toBe(32);

		// And it stays there across a re-derive.
		b.setMeasured('bottom', rows(14));
		expect(b.placed('wide').y).toBe(32);
	});

	it('moves a pushed pane every row the pointer asked for, with no dead zone', () => {
		// The stored top used to have the displacement subtracted from it, so the first rows of a
		// downward drag closed that gap without moving the pane at all.
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(14));
		const before = b.placed('wide');

		dragTo(b, 'wide', before.x, before.y + 4);

		expect(b.authored('wide').y).toBe(24);
		expect(b.placed('wide').y).toBe(24);
	});

	it('keeps a dropped pane inside the board', () => {
		const { arrangement: b } = arrangement();
		dragTo(b, 'top', 40, 0); // a 24-wide pane cannot start at column 40
		expect(b.authored('top').x).toBe(24);
		dragTo(b, 'top', -5, -5);
		expect(b.authored('top')).toMatchObject({ x: 0, y: 0 });
	});

	it('lets the pane being dragged win the spot, pushing its neighbour below', () => {
		const { arrangement: b } = arrangement();
		dragTo(b, 'top', 0, 0); // straight onto `tall`

		expect(b.placed('top').y).toBe(0);
		expect(b.placed('tall').y).toBe(6);
	});

	it('and still wins after a reload, because the priority order is stored too', () => {
		const env = wideEnv();
		const key = `test-reload-${seq++}`;
		const first = new Arrangement(key, LAYOUT, env);
		dragTo(first, 'top', 0, 0);
		first.commit();

		const reopened = new Arrangement(key, LAYOUT, env);
		expect(reopened.placed('top').y).toBe(0);
		expect(reopened.placed('tall').y).toBe(6);
	});

	it('changes places by the height a pane RESERVES, not the one it declared', () => {
		// The gesture is handed the resolved board, so a fitted pane's MEASURED height is the distance a
		// drag has to clear — a good deal further here than the height it declares.
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(14));

		dragTo(b, 'wide', 0, 7); // one row short of clearing it
		expect(b.placed('wide').y).toBe(20);
		expect(b.placed('bottom').y).toBe(6);

		dragTo(b, 'wide', 0, 6); // one row further takes it over
		expect(b.placed('wide').y).toBe(12);
		expect(b.placed('bottom').y).toBe(20);
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

		dragTo(b, 'top', 24, 20);
		expect(new Arrangement(key, LAYOUT, env).placed('top').y).toBe(0);

		b.commit();
		expect(new Arrangement(key, LAYOUT, env).placed('top').y).toBe(20);
	});

	it('never stores displacement, so a saved board cannot drift as the data changes', () => {
		const env = wideEnv();
		const key = `test-drift-${seq++}`;
		const b = new Arrangement(key, LAYOUT, env);

		b.setMeasured('bottom', rows(14)); // pushes `wide` down
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

		dragTo(b, 'top', 24, 20);
		b.commit();
		b.reset();

		expect(b.placed('top').y).toBe(0);
		expect(new Arrangement(key, LAYOUT, env).placed('top').y).toBe(0);
	});
});

describe('seed', () => {
	// What the KPI merge gesture needs: rectangles written before the board is rebuilt around a
	// different set of panes.
	it('overwrites the rectangle of a pane the board already has', () => {
		const { arrangement: b } = arrangement();
		b.seed({ top: { x: 24, y: 0, w: 24, h: 12 } });
		expect(b.placed('top')).toMatchObject({ x: 24, y: 0, w: 24, h: 12 });
	});

	it('persists at once, so a rebuild reads the seeded rectangle back', () => {
		const env = wideEnv();
		const key = `test-seed-${seq++}`;
		new Arrangement(key, LAYOUT, env).seed({ top: { x: 0, y: 30, w: 12, h: 5 } });
		expect(new Arrangement(key, LAYOUT, env).placed('top')).toMatchObject({ x: 0, y: 30, w: 12 });
	});

	it('adds a pane this board’s storage predates', () => {
		const env = wideEnv();
		const key = `test-seed-new-${seq++}`;
		const partial = { tall: LAYOUT.tall } satisfies BoardLayout;
		new Arrangement(key, partial, env).seed({ top: { x: 24, y: 0, w: 24, h: 6 } });

		// `top` was not in the board that seeded it; the board that HAS it reads the rectangle.
		expect(new Arrangement(key, LAYOUT, env).placed('top')).toMatchObject({ x: 24, y: 0, w: 24 });
	});

	it('gives an added pane priority, so it holds the top it was given', () => {
		const env = wideEnv();
		const key = `test-seed-priority-${seq++}`;
		// Storage that predates `top`, which is then seeded onto the same top as `tall`.
		const partial = { tall: LAYOUT.tall } satisfies BoardLayout;
		const first = new Arrangement(key, partial, env);
		first.commit();
		first.seed({ top: { x: 0, y: 0, w: 24, h: 6 } });

		const b = new Arrangement(key, LAYOUT, env);
		expect(b.placed('top').y).toBe(0);
		expect(b.placed('tall').y).toBe(6);
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

describe('growing a pane to its content', () => {
	it('gives it the spans its content needs', () => {
		const { arrangement: b } = arrangement();
		b.grow('top', 30, 9);
		expect(b.placed('top')).toMatchObject({ w: 30, h: 9 });
	});

	it('leaves a pane already big enough alone', () => {
		const { arrangement: b } = arrangement();
		b.grow('tall', 20, 8);
		expect(b.placed('tall')).toMatchObject({ w: 24, h: 12 });
	});

	it('keeps the room it took when the content shrinks back', () => {
		const { arrangement: b } = arrangement();
		b.grow('top', 30, 9);
		b.grow('top', 24, 6);
		expect(b.placed('top')).toMatchObject({ w: 30, h: 9 });
	});

	it('gives the room back when the user resizes it away', () => {
		const { arrangement: b } = arrangement();
		b.grow('top', 30, 9);
		b.resizeTo('top', { x: 24, y: 0, w: 24, h: 6 });
		expect(b.placed('top')).toMatchObject({ w: 24, h: 6 });
	});

	it('writes it to the pane itself, so a gesture starts from the size on screen', () => {
		const { arrangement: b } = arrangement();
		b.grow('top', 30, 9);
		expect(b.authored('top')).toMatchObject({ w: 30, h: 9 });
	});

	it('leaves a fitted list to its own measurement, which tracks content both ways', () => {
		const { arrangement: b } = arrangement();
		b.setMeasured('bottom', rows(7));
		b.grow('bottom', 24, 40);
		expect(b.placed('bottom').h).toBe(7);
	});

	it('shifts a widened pane off the right edge rather than overrunning the board', () => {
		const { arrangement: b } = arrangement();
		b.grow('top', 30, 6);
		const top = b.placed('top');
		expect(top.x + top.w).toBeLessThanOrEqual(48);
	});

	it('drops the room it took on reset', () => {
		const { arrangement: b } = arrangement();
		b.grow('top', 30, 9);
		b.reset();
		expect(b.placed('top')).toMatchObject({ w: 24, h: 6 });
	});
});

// Typing into a label is the one edit whose floor moves both ways: a title made too long and then trimmed
// again has to leave the pane where it started.
describe('a label being typed into', () => {
	it('grows the pane as the words stop fitting', () => {
		const { arrangement: b } = arrangement();
		b.startDraft('top', 24, 6);
		b.setDraft(24, 9);
		expect(b.placed('top').h).toBe(9);
	});

	it('gives the room back as they are deleted', () => {
		const { arrangement: b } = arrangement();
		b.startDraft('top', 24, 6);
		b.setDraft(24, 9);
		b.relaxDraft();
		expect(b.placed('top').h).toBe(6);
	});

	it('never goes below the size the edit opened at', () => {
		const { arrangement: b } = arrangement();
		b.startDraft('top', 24, 6);
		b.setDraft(12, 3);
		expect(b.placed('top')).toMatchObject({ w: 24, h: 6 });
	});

	it('keeps what the edit settled on once it ends', () => {
		const { arrangement: b } = arrangement();
		b.startDraft('top', 24, 6);
		b.setDraft(24, 9);
		b.endDraft();
		expect(b.drafting).toBeNull();
		expect(b.placed('top').h).toBe(9);
	});

	it('stops following the words after that, so a later trim keeps the room', () => {
		const { arrangement: b } = arrangement();
		b.startDraft('top', 24, 6);
		b.setDraft(24, 9);
		b.endDraft();
		b.startDraft('top', 24, 9);
		b.relaxDraft();
		expect(b.placed('top').h).toBe(9);
	});

	it('names the pane it is following, so a probe leaves that one alone', () => {
		const { arrangement: b } = arrangement();
		expect(b.drafting).toBeNull();
		b.startDraft('top', 24, 6);
		expect(b.drafting).toBe('top');
	});

	it('leaves every other pane to its own committed floor', () => {
		const { arrangement: b } = arrangement();
		b.grow('tall', 24, 14);
		b.startDraft('top', 24, 6);
		b.setDraft(24, 9);
		expect(b.placed('tall').h).toBe(14);
	});
});
