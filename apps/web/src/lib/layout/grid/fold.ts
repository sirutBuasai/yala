// Folding: what the board becomes when the content column no longer fits. Coordinates are dropped
// rather than rescaled, and what survives is the arrangement's row-major reading order — expressed
// as a CSS `order` per pane, so the DOM keeps the views' declaration order, which is also its tab
// order at full width.

import { COLS } from './units';
import type { PlacedPane } from './types';

/** Row-major reading order for a resolved board, as an id → order index map. */
export function readingOrder(placed: PlacedPane[]): Record<string, number> {
	const sorted = [...placed].sort((a, b) => a.y - b.y || a.x - b.x);
	return Object.fromEntries(sorted.map((p, i) => [p.id, i]));
}

/**
 * Columns a pane spans in a folded board of `cols`. A pane that took more than half the full board
 * was that region's principal figure, so it keeps the whole width rather than being squeezed.
 */
export function foldSpan(w: number, cols: number): number {
	return cols > 1 && w * 2 > COLS ? cols : 1;
}
