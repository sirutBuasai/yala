// The drag geometry: which edges a gesture may take hold of, and what a pointer's travel does to a
// rectangle. Pure — no DOM, no Svelte.

import { UNIT } from './units';
import type { HeightMode, Rect } from './types';

/** Which edges of a pane a gesture is dragging: any of `n s e w`. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** A fitted pane's height isn't the user's to set, so those handles are absent rather than inert. */
export const EDGES: Record<HeightMode, Edge[]> = {
	fixed: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
	cap: ['s', 'e', 'w', 'se', 'sw'],
	fit: ['e', 'w']
};

/** Travel in px, snapped at the halfway point either way. Not `rowsForPx`, which rounds a card's size up and
    counts the gap. */
export function snapUnits(px: number): number {
	return Math.round(px / UNIT);
}

/** Apply one edge's cumulative delta to the press-time rectangle. */
export function resizeRect(base: Rect, edge: Edge, dx: number, dy: number): Rect {
	const [dux, duy] = [snapUnits(dx), snapUnits(dy)];
	const rect = { ...base };
	if (edge.includes('e')) rect.w = base.w + dux;
	if (edge.includes('w')) {
		rect.x = base.x + dux;
		rect.w = base.w - dux;
	}
	if (edge.includes('s')) rect.h = base.h + duy;
	if (edge.includes('n')) {
		rect.y = base.y + duy;
		rect.h = base.h - duy;
	}
	return rect;
}

/** The same, for a move: the press-time rectangle translated by the snapped travel. */
export function moveRect(base: Rect, dx: number, dy: number): Rect {
	return { ...base, x: base.x + snapUnits(dx), y: base.y + snapUnits(dy) };
}

/** The least a pane's content fits in, in units: any rectangle at least this on both axes fits. */
export interface Floor {
	w: number;
	h: number;
}

/** The dragged edge stops at the floor, so the opposite edge stays where the press left it. */
export function holdFloor(base: Rect, edge: Edge, rect: Rect, floor: Floor): Rect {
	const out = { ...rect };
	if (out.w < floor.w) {
		out.w = floor.w;
		if (edge.includes('w')) out.x = base.x + base.w - floor.w;
	}
	if (out.h < floor.h) {
		out.h = floor.h;
		if (edge.includes('n')) out.y = base.y + base.h - floor.h;
	}
	return out;
}

/** The least `v` in `[lo, hi]` for which `ok` holds, given it holds from some point on; `hi` when it never
    does. */
export async function lowest(
	lo: number,
	hi: number,
	ok: (v: number) => Promise<boolean>
): Promise<number> {
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (await ok(mid)) hi = mid;
		else lo = mid + 1;
	}
	return hi;
}
