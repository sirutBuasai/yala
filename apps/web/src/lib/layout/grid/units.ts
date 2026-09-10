// The board's ruler. Every number the grid depends on is derived from these three, so the dot
// lattice, the snap distance and the CSS tracks cannot drift apart.
//
// The content column is locked to a whole number of square units. 48 divides by 2, 3, 4, 6, 8, 12
// and 16, so halves, thirds and quarters are all whole column counts — which is what makes a
// hand-authored default layout expressible without fractions.
//
// The GAP is deliberately NOT a grid gap. The CSS grid runs at zero gap and every pane insets
// itself by half a gap instead. One unit is then exactly `content / COLS`, so a track boundary
// lands on every multiple of the unit and the dot underlay can be a single repeating gradient with
// no gutter arithmetic. Put the gap on the grid and each track becomes `(content - 47*gap)/48`,
// which no repeating background can follow.

/** Columns in the content width. */
export const COLS = 48;

/** One grid unit, in px. Rows use the same value, so the lattice is square and vertical snapping
    is width-independent. */
export const UNIT = 28;

/** The locked content width: 1344px. */
export const CONTENT = COLS * UNIT;

/** Visual gap between panes, applied as half an inset on each pane rather than as a grid gap. */
export const GAP = 14;

/** Each pane's own inset — half a gap, so two neighbours read as one full gap apart. */
export const INSET = GAP / 2;

/** The page column's horizontal padding, one side. */
export const WRAP_PAD = 24;

/** `.wrap` must be this wide for the content column to reach its full width. */
export const WRAP_WIDTH = CONTENT + 2 * WRAP_PAD;

/**
 * Universal floor for a pane, in units. Charts that are pure vector never overflow — they only get
 * illegible — so a declared floor is the only limit they can have. Everything else is measured: the
 * spill check raises the real minimum wherever the content has an intrinsic size.
 */
export const MIN_W = 5;
export const MIN_H = 3;

/** Below this content width the board folds to a single column. 60rem at a 16px root. */
export const ONE_COLUMN = 960;

/** How the board is laid out at a given content width. */
export type FoldMode = 'full' | 'two' | 'one';

/**
 * How a measured content width folds. Arranging is only offered at `'full'`: the stored
 * coordinates describe a 48-column board, and applying them to a narrower one would either scale
 * the unit (breaking the square lattice) or clip the right-hand panes.
 */
export function foldMode(content: number): FoldMode {
	if (content >= CONTENT) return 'full';
	return content <= ONE_COLUMN ? 'one' : 'two';
}

/** Columns the folded board renders with. */
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
