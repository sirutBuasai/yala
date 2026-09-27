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

/** The most a full board is shrunk to keep its layout; any smaller and its type stops reading comfortably,
    so the board folds instead. */
export const MIN_SCALE = 0.8;

/** `scaled` is the full board drawn smaller: the layout the user arranged, just not editable. */
export type FoldMode = 'full' | 'scaled' | 'two' | 'one';

/** Arranging is offered only at `'full'`, the board the stored coordinates describe at their own size. */
export function foldMode(content: number): FoldMode {
	if (content >= CONTENT) return 'full';
	if (content >= CONTENT * MIN_SCALE) return 'scaled';
	return content <= ONE_COLUMN ? 'one' : 'two';
}

/** Whether panes drop their coordinates and flow in columns. */
export function folds(fold: FoldMode): boolean {
	return fold === 'two' || fold === 'one';
}

export function foldColumns(fold: FoldMode): number {
	return fold === 'two' ? 2 : fold === 'one' ? 1 : COLS;
}

/** The row a board folded into columns is laid out on, in px: fine enough that a card's height rounds up by
    less than anyone would see. */
export const STACK_ROW = 4;

/** Whole rows a measured pixel height occupies, floored at one row. */
export function rowsForPx(px: number): number {
	return Math.max(1, Math.ceil((px + GAP) / UNIT));
}

/** Pixel height of `n` rows of card — the inverse of `rowsForPx`, for showing a set cap. */
export function pxForRows(rows: number): number {
	return rows * UNIT - GAP;
}
