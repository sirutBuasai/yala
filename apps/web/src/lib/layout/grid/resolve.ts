// Collision resolution: the whole geometry rule set, pure, with no DOM and no Svelte.
//
// Every collision resolves by pushing DOWN, never sideways — a 2D cascade has no termination
// guarantee. A pane's top is the lowest of its authored top and the bottoms of the column-sharing
// panes ahead of it, recomputed from scratch each render: the authored top is a floor, not a target.

import { COLS, MIN_H, MIN_W } from './units';
import type { PlacedPane, Rect, SizedPane } from './types';

export function sharesColumns(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w;
}

export function overlaps(a: Rect, b: Rect): boolean {
	return sharesColumns(a, b) && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Place every pane, pushing down out of collisions. `panes` arrives in priority order, which breaks
 * ties on authored top: stored intent rather than a transient memory of who moved last. Returned in
 * the input's order, each pane carrying the rows it was displaced by.
 */
export function resolve(panes: SizedPane[]): PlacedPane[] {
	// Authored top first, so a pane authored higher can never be pushed by one authored lower.
	const order = panes.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y || a.i - b.i);

	const settled: PlacedPane[] = [];
	const byId = new Map<string, PlacedPane>();

	for (const { p } of order) {
		// A fixed point rather than one pass: lowering the top can bring the pane into contact with a
		// neighbour it had cleared. `y` only increases, bounded by the lowest settled bottom.
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
 * Without the subtraction, storing where the pane was dropped would store the push as if the user
 * had asked for it, and the next render would apply it a second time.
 */
export function authoredY(placedY: number, offset: number): number {
	return Math.max(0, placedY - offset);
}

export function clampRect(rect: Rect): Rect {
	const w = Math.min(COLS, Math.max(MIN_W, rect.w));
	const h = Math.max(MIN_H, rect.h);
	return { x: Math.min(COLS - w, Math.max(0, rect.x)), y: Math.max(0, rect.y), w, h };
}

/** Rows the board occupies, so the container can reserve them. */
export function boardRows(placed: PlacedPane[]): number {
	return placed.reduce((rows, p) => Math.max(rows, p.y + p.h), 0);
}

/** The invariant: a rendered board can never show an overlap. Checked on every resolve in dev, so a
    regression surfaces where it happened rather than as a visual artefact. */
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
