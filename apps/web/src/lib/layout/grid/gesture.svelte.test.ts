// The gesture, driven with a fake arrangement and a scripted spill answer. This is where the awkward
// cases live — a superseded probe, a rejected size, a capped pane's bottom edge — and none of them
// need a browser, because the gesture is handed its answers rather than reading them off the DOM.

import { describe, expect, it } from 'vitest';
import { PaneGesture, type GestureTarget } from '$lib/layout/grid/gesture.svelte';
import { lift } from '$lib/layout/grid/lift';
import { clampRect } from '$lib/layout/grid/resolve';
import { MIN_H, UNIT } from '$lib/layout/grid/units';
import type { AuthoredPane, PlacedPane } from '$lib/layout/grid/types';

const ID = 'b';

/** `n` units of travel, in px — what the drag action reports. */
const px = (units: number) => units * UNIT;

/** Let a fire-and-forget gesture (the keyboard path) run to completion. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface Fake extends GestureTarget {
	panes: AuthoredPane[];
	committed: AuthoredPane[] | null;
	drags: { x: number; y: number }[];
}

/**
 * A board with two panes, the one under test SECOND so its promotion is visible. `dragTo` and
 * `resizeTo` reuse the same pure rules as `Arrangement`, so what the test pins down is the gesture.
 * Every pane carries the same `offset`, which is enough to exercise the displacement round-trip.
 */
function fake(over: Partial<AuthoredPane> = {}, offset = 0): Fake {
	const patch = (id: string, next: (i: AuthoredPane) => AuthoredPane) => {
		self.panes = self.panes.map((i) => (i.id === id ? next(i) : i));
	};

	const self: Fake = {
		panes: [
			{ id: 'a', x: 20, y: 0, w: 8, h: 6, mode: 'fixed', cap: 10 },
			{ id: ID, x: 4, y: 4, w: 12, h: 6, mode: 'fixed', cap: 10, ...over }
		],
		committed: null,
		drags: [],
		authored: (id) => self.panes.find((i) => i.id === id)!,
		mode: (id) => self.authored(id).mode,
		snapshot: () => self.panes.map((i) => ({ ...i })),
		restore: (panes) => {
			self.panes = panes.map((i) => ({ ...i }));
		},
		beginDrag: () => ({
			authored: self.snapshot(),
			placed: self.panes.map((i): PlacedPane => ({
				id: i.id,
				x: i.x,
				y: i.y + offset,
				w: i.w,
				h: i.h,
				offset
			}))
		}),
		dragTo: (id, x, y, origin) => {
			self.drags.push({ x, y });
			self.panes = lift(id, x, y, origin);
		},
		resizeTo: (id, rect) => {
			if (self.mode(id) === 'cap') {
				const clamped = clampRect({ ...rect, h: self.authored(id).h });
				patch(id, (i) => ({
					...i,
					x: clamped.x,
					w: clamped.w,
					cap: Math.max(MIN_H, Math.round(rect.h))
				}));
				return;
			}
			const clamped = clampRect(rect);
			patch(id, (i) => ({ ...i, ...clamped }));
		},
		commit: () => {
			self.committed = self.panes.map((i) => ({ ...i }));
		}
	};
	return self;
}

/**
 * A gesture whose spill answers come from a script, one per probe, the last standing for the rest.
 * `gates` holds the settle back so a test can interleave two pointer moves; without it a candidate
 * is laid out the moment it is asked for.
 */
function gesture(arrangement: Fake, answers: boolean[] = [], gates?: (() => void)[]) {
	const probes = { calls: 0 };
	const s = new PaneGesture(() => ID, arrangement, {
		spills: () => {
			probes.calls++;
			return answers[probes.calls - 1] ?? answers.at(-1) ?? false;
		},
		settle: () => (gates ? new Promise<void>((resolve) => gates.push(resolve)) : Promise.resolve())
	});
	return { s, probes };
}

describe('moving', () => {
	it('commits the position it was dropped at, push and all', () => {
		// The pane is sitting three rows below where it was authored, pushed down by a neighbour.
		const arrangement = fake({}, 3);
		const { s } = gesture(arrangement);

		s.beginMove();
		s.endMove(px(1), px(2));

		// Dropped in PLACED coordinates — where it is on screen — and stored there: the push it was
		// carrying is now its own top, so the two rows the pointer travelled move it two rows.
		expect(arrangement.drags).toEqual([{ x: 5, y: 4 + 3 + 2 }]);
		expect(arrangement.authored(ID)).toMatchObject({ x: 5, y: 9 });
		expect(arrangement.committed).toEqual(arrangement.panes);
	});

	it('replays each delta from the press, so leaning on a wall costs nothing', () => {
		const arrangement = fake();
		const { s } = gesture(arrangement);

		s.beginMove();
		s.moveTo(px(-40), 0); // far left, where the board clamps
		s.moveTo(px(-80), 0); // leaning on the wall
		s.endMove(px(2), 0);

		expect(arrangement.authored(ID)).toMatchObject({ x: 6, y: 4 });
	});

	it('does nothing without a press', () => {
		const arrangement = fake();
		const { s } = gesture(arrangement);
		s.moveTo(px(4), 0);
		expect(arrangement.drags).toEqual([]);
	});

	it('reports where the pointer is aiming, whether the board can give it or not', () => {
		const arrangement = fake();
		const { s } = gesture(arrangement);

		// Nothing to show for a press that has not travelled, or once the pane is down.
		s.beginMove();
		expect(s.aim).toBeNull();

		s.moveTo(px(2), px(-6));
		// Two columns right and six rows up, from a pane authored at (4,4): the rows above the board are
		// refused for the pane, and the target is clamped to the same place rather than running off it.
		expect(s.aim).toEqual({ x: 6, y: 0, w: 12, h: 6 });

		s.endMove(px(2), px(-6));
		expect(s.aim).toBeNull();
	});

	it('drops the target when the gesture is abandoned', () => {
		const arrangement = fake();
		const { s } = gesture(arrangement);

		s.beginMove();
		s.moveTo(0, px(3));
		expect(s.aim).not.toBeNull();

		s.abandon();
		expect(s.aim).toBeNull();
	});
});

describe('abandoning', () => {
	it('puts the whole board back, including the promotion the move made on the way', () => {
		const arrangement = fake();
		const { s } = gesture(arrangement);

		s.beginMove();
		s.moveTo(px(6), px(6));
		expect(arrangement.panes.map((i) => i.id)).toEqual([ID, 'a']);

		s.abandon();

		expect(arrangement.panes.map((i) => i.id)).toEqual(['a', ID]);
		expect(arrangement.authored(ID)).toMatchObject({ x: 4, y: 4 });
		expect(arrangement.committed).toBeNull();
	});

	it('restores a resize too, and clears the rejected state', async () => {
		const arrangement = fake();
		const { s } = gesture(arrangement, [true]);

		s.beginResize();
		await s.previewResize('e', px(20), 0);
		expect(s.invalid).toBe(true);

		s.abandon();
		expect(s.invalid).toBe(false);
		expect(arrangement.authored(ID)).toMatchObject({ w: 12 });
	});
});

describe('resizing', () => {
	it('follows the pointer while the content fits', async () => {
		const arrangement = fake();
		const { s } = gesture(arrangement, [false]);

		s.beginResize();
		await s.previewResize('se', px(3), px(2));

		expect(arrangement.authored(ID)).toMatchObject({ w: 15, h: 8 });
		expect(s.invalid).toBe(false);
	});

	it('holds the preview at the last fitting size once the content spills', async () => {
		const arrangement = fake();
		const { s } = gesture(arrangement, [false, true, true]);

		s.beginResize();
		await s.previewResize('w', px(-2), 0); // 14 wide, and it fits
		expect(arrangement.authored(ID)).toMatchObject({ x: 2, w: 14 });

		await s.previewResize('w', px(-6), 0); // 18 wide, and it does not
		expect(arrangement.authored(ID)).toMatchObject({ x: 2, w: 14 });
		expect(s.invalid).toBe(true);

		await s.previewResize('w', px(-10), 0); // pushing further changes nothing
		expect(arrangement.authored(ID)).toMatchObject({ x: 2, w: 14 });
		expect(s.invalid).toBe(true);
	});

	it('keeps the last fitting size on release, and stops wearing the rejected state', async () => {
		const arrangement = fake();
		const { s } = gesture(arrangement, [false, true]);

		s.beginResize();
		await s.previewResize('e', px(2), 0); // 14 wide, and it fits
		await s.endResize('e', px(9), 0); // released well past the limit

		// The gesture is never thrown away: the pane keeps the widest size its content fitted in.
		expect(arrangement.authored(ID)).toMatchObject({ w: 14 });
		expect(s.invalid).toBe(false);
		expect(arrangement.committed).toEqual(arrangement.panes);
	});

	it('rejects even the first candidate back to the press-time size', async () => {
		const arrangement = fake();
		const { s } = gesture(arrangement, [true]);

		s.beginResize();
		await s.endResize('s', px(0), px(-2));

		expect(arrangement.authored(ID)).toMatchObject({ y: 4, h: 6 });
		expect(s.invalid).toBe(false);
	});

	it('lets no superseded probe overwrite a newer candidate', async () => {
		const arrangement = fake();
		const gates: (() => void)[] = [];
		const { s, probes } = gesture(arrangement, [false], gates);

		s.beginResize();
		const stale = s.previewResize('e', px(2), 0); // 14 wide
		const fresh = s.previewResize('e', px(6), 0); // 18 wide, and this is the live one

		gates.shift()!();
		await stale;
		// The stale candidate does not even get to ask: whatever the DOM says now, it is answering about
		// a size the pointer has already left, and acting on it would undo the newer one.
		expect(probes.calls).toBe(0);
		expect(arrangement.authored(ID)).toMatchObject({ w: 18 });

		gates.shift()!();
		await fresh;
		expect(probes.calls).toBe(1);
		expect(arrangement.authored(ID)).toMatchObject({ w: 18 });
		expect(s.invalid).toBe(false);
	});

	it("edits a capped pane's ceiling, not its height", async () => {
		const arrangement = fake({ mode: 'cap', h: 6, cap: 10 });
		const { s } = gesture(arrangement, [false]);

		s.beginResize();
		// The press-time rectangle takes its vertical extent from the CEILING, so the bottom edge picks
		// up where the dashed outline is rather than where the content currently reaches.
		await s.previewResize('s', 0, px(3));

		expect(arrangement.authored(ID)).toMatchObject({ h: 6, cap: 13 });
	});

	it('does nothing without a press', async () => {
		const arrangement = fake();
		const { s, probes } = gesture(arrangement);
		await s.previewResize('e', px(4), 0);
		expect(arrangement.authored(ID)).toMatchObject({ w: 12 });
		expect(probes.calls).toBe(0);
	});
});

describe('keyboard steps', () => {
	it('moves the pane by one unit and commits', () => {
		const arrangement = fake();
		const { s } = gesture(arrangement);

		s.step(0, 1, false);

		expect(arrangement.authored(ID)).toMatchObject({ x: 4, y: 5 });
		expect(arrangement.committed).toEqual(arrangement.panes);
	});

	it('resizes by one unit on the edge the arrow points at', async () => {
		const arrangement = fake();
		const { s } = gesture(arrangement, [false]);

		s.step(1, 0, true);
		await flush();
		expect(arrangement.authored(ID)).toMatchObject({ w: 13 });

		s.step(0, 1, true);
		await flush();
		expect(arrangement.authored(ID)).toMatchObject({ h: 7 });
	});

	it("refuses a resize on an edge this height mode does not put in the user's hands", async () => {
		const arrangement = fake({ mode: 'fit' });
		const { s } = gesture(arrangement, [false]);

		s.step(0, 1, true);
		await flush();

		expect(arrangement.authored(ID)).toMatchObject({ h: 6 });
		expect(arrangement.committed).toBeNull();
	});
});
