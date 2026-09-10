// The board's ruler: every grid number derives from these, so the dot lattice, the snap distance
// and the CSS tracks cannot drift apart.

/** Columns in the content width. Highly divisible, so halves, thirds and quarters are all whole
    column counts. */
export const COLS = 48;

/** One grid unit, in px. Rows use the same value, so the lattice is square and vertical snapping
    is width-independent. */
export const UNIT = 28;

export const CONTENT = COLS * UNIT;

/**
 * Deliberately NOT a grid gap. The CSS grid runs at zero gap and each pane insets itself by half of
 * this instead, which keeps one unit at exactly `CONTENT / COLS` — a whole number of pixels, so a track
 * boundary lands on every multiple of the unit and the dot underlay can be one repeating gradient. Put
 * the gap on the grid and a track no longer divides evenly, and no repeating background can follow it.
 */
export const GAP = 14;

export const INSET = GAP / 2;

export const WRAP_PAD = 24;

export const WRAP_WIDTH = CONTENT + 2 * WRAP_PAD;

/**
 * Universal floor for a pane, in units. Pure-vector charts never overflow — they only get
 * illegible — so a declared floor is the only limit they can have. Everything else is measured:
 * the spill check raises the real minimum wherever the content has an intrinsic size.
 */
export const MIN_W = 5;
export const MIN_H = 3;

/** Below this content width the board folds to a single column. */
export const ONE_COLUMN = 960;

export type FoldMode = 'full' | 'two' | 'one';

/**
 * How a measured content width folds. Arranging is only offered at `'full'`: the stored
 * coordinates describe a 48-column board.
 */
export function foldMode(content: number): FoldMode {
	if (content >= CONTENT) return 'full';
	return content <= ONE_COLUMN ? 'one' : 'two';
}

export function foldColumns(fold: FoldMode): number {
	return fold === 'full' ? COLS : fold === 'two' ? 2 : 1;
}

/** Whole rows a measured pixel height occupies, floored at one row. */
export function rowsForPx(px: number): number {
	return Math.max(1, Math.ceil((px + GAP) / UNIT));
}

/** Pixel height of `n` rows of card — the inverse of `rowsForPx`, for showing a set cap. */
export function pxForRows(rows: number): number {
	return rows * UNIT - GAP;
}
