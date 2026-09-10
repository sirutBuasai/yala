// Folding: what the board becomes when the content column no longer fits.
//
// Coordinates are dropped entirely rather than rescaled. What survives is the ARRANGEMENT'S
// SEQUENCE — panes flow in the row-major reading order of the board the user arranged — so the
// layout they built still decides what comes first, and heights hug their content because there is
// no neighbour left to line up with.
//
// The fold is expressed as an `order` per pane rather than by reordering the markup: CSS Grid
// honours `order` on its items, so the DOM stays in the views' declaration order (which is also
// its tab order at full width) and one integer per pane does the whole job.

import { COLS } from './units';
import type { PlacedPane } from './types';

/**
 * Row-major reading order for a resolved board: top to bottom, then left to right. Returned as an
 * id → order index map, ready for the CSS `order` property.
 */
export function readingOrder(placed: PlacedPane[]): Record<string, number> {
	const sorted = [...placed].sort((a, b) => a.y - b.y || a.x - b.x);
	return Object.fromEntries(sorted.map((p, i) => [p.id, i]));
}

/**
 * Columns a pane spans in a folded board of `cols`. A pane that took more than half the full board
 * was that region's principal figure, so it keeps the whole width here rather than being squeezed
 * beside something secondary.
 */
export function foldSpan(w: number, cols: number): number {
	return cols > 1 && w * 2 > COLS ? cols : 1;
}
