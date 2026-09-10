// Collision resolution: the whole geometry rule set, pure, with no DOM and no Svelte.
//
// ── The rule ──────────────────────────────────────────────────────────────────
// Every collision resolves by pushing DOWN, on one axis only. Never sideways: a sideways push
// needs a 2D cascade, which has no termination guarantee — A pushes B right, B pushes C down, C
// pushes A left, and round again.
//
// A pane's final top is the LOWEST of: its own authored top, and the bottom of every pane that
// shares a column with it and comes before it in the resolution order. Stated that way, three
// things fall out for free rather than needing cases of their own:
//
//   · Two panes growing into the same neighbour take the MAXIMUM of their demands, not the sum,
//     because it is a max over bottoms and not an accumulation of deltas.
//   · A pane that RISES (a fitted pane above it shrank) is floored by the neighbours that did
//     NOT shrink, because every render recomputes that same max from scratch. Remember an offset
//     instead and the pane slides underneath the neighbour that stayed put.
//   · Gaps the user left are preserved. The authored top is a floor, not a target, so a pane with
//     six empty rows above it keeps them; growth only closes the overlap it actually causes.
//
// ── The order ─────────────────────────────────────────────────────────────────
// `panes` arrives in PRIORITY order and is sorted by authored top, stably. So a pane authored
// higher up always wins, and among panes authored at the same top the earlier one wins. The state
// layer moves the pane the user just dragged to the front, which is what makes "drop a pane onto
// its neighbour and the NEIGHBOUR goes below" survive a reload: the priority is authored intent,
// stored alongside the rectangles, not a transient memory of who moved last.

import { COLS, MIN_H, MIN_W } from './units';
import type { PlacedPane, Rect, SizedPane } from './types';

/** Do two rectangles share any column? */
export function sharesColumns(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w;
}

/** Do two rectangles share any cell? */
export function overlaps(a: Rect, b: Rect): boolean {
	return sharesColumns(a, b) && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Place every pane, pushing down out of collisions.
 *
 * `panes` is in priority order (first wins a tie on authored top). The returned list is in the
 * same order as the input, each pane carrying the rows it was displaced by.
 */
export function resolve(panes: SizedPane[]): PlacedPane[] {
	// Stable sort by authored top: a pane authored higher can never be pushed by one authored
	// lower, whatever the priority order says.
	const order = panes.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y || a.i - b.i);

	const settled: PlacedPane[] = [];
	const byId = new Map<string, PlacedPane>();

	for (const { p } of order) {
		// Fixed point rather than one pass: raising the top can bring the pane into contact with a
		// neighbour it cleared a moment ago. `y` only ever increases and is bounded by the lowest
		// bottom already settled, so this terminates.
		let y = p.y;
		for (let moved = true; moved;) {
			moved = false;
			for (const q of settled) {
				const bottom = q.y + q.h;
				if (bottom > y && sharesColumns(p, q)) {
					y = bottom;
					moved = true;
				}
			}
		}

		const placed: PlacedPane = { id: p.id, x: p.x, y, w: p.w, h: p.h, offset: y - p.y };
		settled.push(placed);
		byId.set(p.id, placed);
	}

	// Back into the caller's order, so a component's `{#each}` key order is untouched.
	return panes.map((p) => byId.get(p.id)!);
}

/**
 * The authored top for a pane dropped at `placedY` while carrying `offset` rows of displacement.
 *
 * This subtraction is the difference between a drag that works and one that jumps: the pane on
 * screen sits at `authored + offset`, so storing where it was dropped would store the push as if
 * the user had asked for it, and the next render would apply the push a second time.
 */
export function authoredY(placedY: number, offset: number): number {
	return Math.max(0, placedY - offset);
}

/** Clamp a rectangle to the board's columns and the universal floor. */
export function clampRect(rect: Rect): Rect {
	const w = Math.min(COLS, Math.max(MIN_W, rect.w));
	const h = Math.max(MIN_H, rect.h);
	return { x: Math.min(COLS - w, Math.max(0, rect.x)), y: Math.max(0, rect.y), w, h };
}

/** Rows the board occupies, so the container can reserve them. */
export function boardRows(placed: PlacedPane[]): number {
	return placed.reduce((rows, p) => Math.max(rows, p.y + p.h), 0);
}

/**
 * The invariant: a rendered board can never show an overlap. Called on every resolve in dev so a
 * regression in the push rule surfaces where it happened rather than as a visual artefact someone
 * notices three views later.
 */
export function firstOverlap(placed: PlacedPane[]): [PlacedPane, PlacedPane] | null {
	for (let i = 0; i < placed.length; i++) {
		for (let j = i + 1; j < placed.length; j++) {
			if (overlaps(placed[i]!, placed[j]!)) return [placed[i]!, placed[j]!];
		}
	}
	return null;
}

export function assertNoOverlap(placed: PlacedPane[]): void {
	const clash = firstOverlap(placed);
	if (clash) {
		const [a, b] = clash;
		throw new Error(
			`board overlap: ${a.id} (${a.x},${a.y},${a.w}x${a.h}) vs ${b.id} (${b.x},${b.y},${b.w}x${b.h})`
		);
	}
}
