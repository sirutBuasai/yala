// The board's ruler: every grid number derives from these, so the dot lattice, the snap distance
// and the CSS tracks cannot drift apart.

/** Columns in the content width. Highly divisible, so halves, thirds and quarters are all whole
    column counts. */
export const COLS = 48;

/** One grid unit, in px. Rows use the same value, so the lattice is square and vertical snapping
    is width-independent. */
export const UNIT = 28;

export const CONTENT = COLS * UNIT;

/** Not a grid gap: panes inset by half of it, so a unit stays whole pixels and the dot grid repeats. */
export const GAP = 14;

export const WRAP_PAD = 24;

/** Vector charts never overflow, only get illegible, so this is their only limit; the rest is measured. */
export const MIN_W = 5;
export const MIN_H = 3;

/** Below this content width the board folds to a single column. */
export const ONE_COLUMN = 960;

export type FoldMode = 'full' | 'two' | 'one';

/** Arranging is offered only at `'full'`, the board the stored coordinates describe. */
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
