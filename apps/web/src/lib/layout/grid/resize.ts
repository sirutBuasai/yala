// The drag geometry: which edges a gesture may take hold of, and what a pointer's travel does to a
// rectangle. Pure — no DOM, no Svelte — so the rules a resize obeys are unit-tested rather than
// driven through a browser.

import { UNIT } from './units';
import type { HeightMode, Rect } from './types';

/** Which edges of a pane a gesture is dragging: any of `n s e w`. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Which edges may be dragged, per height mode. A fitted pane's height is not the user's to set
 * directly, so the handles that would change it are absent rather than present and inert — the
 * handles you can see are exactly the ones that do something.
 */
export const EDGES: Record<HeightMode, Edge[]> = {
	fixed: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
	cap: ['s', 'e', 'w', 'se', 'sw'],
	fit: ['e', 'w']
};

/**
 * Pointer travel in px, snapped to the nearest whole unit. NOT the same question as `rowsForPx`,
 * which asks how many units a measured card OCCUPIES and so rounds up and counts the gap in: travel
 * is a signed distance along the lattice, and the pane changes size at the halfway point in either
 * direction.
 */
export function snapUnits(px: number): number {
	return Math.round(px / UNIT);
}

/**
 * Apply one edge's cumulative delta to the press-time rectangle. Deltas are cumulative from the
 * press, never incremental, which is what lets the same delta be replayed: the board's clamping is
 * re-derived from a fixed origin rather than accumulated, so dragging into a wall and back out again
 * is exact.
 */
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
