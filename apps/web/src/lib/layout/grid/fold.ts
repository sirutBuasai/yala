// Coordinates are dropped rather than rescaled, and reading order survives as a CSS `order`, so the DOM keeps
// the declaration order and tab order.

import { COLS } from './units';
import type { PlacedPane } from './types';

/** Row-major reading order for a resolved board, as an id → order index map. */
export function readingOrder(placed: PlacedPane[]): Record<string, number> {
	const sorted = [...placed].sort((a, b) => a.y - b.y || a.x - b.x);
	return Object.fromEntries(sorted.map((p, i) => [p.id, i]));
}

/** A pane over half the full board was its region's principal figure, so it keeps the whole width. */
export function foldSpan(w: number, cols: number): number {
	return cols > 1 && w * 2 > COLS ? cols : 1;
}
