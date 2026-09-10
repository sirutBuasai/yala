// How many rows a pane reserves — the one place the four pane sizings differ.
//
// Charts have exactly one sizing: the pane's height is whatever it was given, and the chart scales
// to fill it. Lists have three, and they differ only in who owns the height and whether that
// ownership has a ceiling.

import { rowsForPx } from './units';
import type { AuthoredPane, HeightMode, PaneContent, PaneSpec, SizedPane } from './types';

/**
 * The height mode a pane actually runs in. A `scale` pane is always `fixed`: it has no content
 * height of its own to fit to, so fitting it would collapse it to its floor and call that an
 * answer.
 */
export function effectiveMode(content: PaneContent, mode: HeightMode): HeightMode {
	return content === 'scale' ? 'fixed' : mode;
}

/** Does this pane's card hug its content rather than stretching to its grid cell? */
export function hugs(mode: HeightMode): boolean {
	return mode === 'fit' || mode === 'cap';
}

/** Does this pane scroll its body once the content overruns? */
export function scrolls(content: PaneContent, mode: HeightMode): boolean {
	return content === 'flow' && mode !== 'fit';
}

/**
 * Rows a pane reserves on the board.
 *
 * `measured` is its card's height in px, which only a fitted pane needs. While ARRANGING, a capped
 * pane reserves its whole ceiling even when the list has not reached it — otherwise the user would
 * place a neighbour in space the list is entitled to grow into, and adding two rows of data would
 * shove it back out again.
 */
export function reservedRows(
	authored: AuthoredPane,
	content: PaneContent,
	measured: number | undefined,
	arranging: boolean
): number {
	const mode = effectiveMode(content, authored.mode);
	if (mode === 'fixed') return authored.h;

	// No measurement yet (first render, or a folded board that never measured): the authored height
	// is the best available guess and stops the board collapsing for one frame.
	const rows = measured === undefined ? authored.h : rowsForPx(measured);
	if (mode === 'fit') return rows;
	return arranging ? authored.cap : Math.min(rows, authored.cap);
}

/** Resolve a whole board's authored panes into the rectangles the collision pass reads. */
export function sizePanes(
	authored: AuthoredPane[],
	specs: Record<string, PaneSpec>,
	measured: Record<string, number>,
	arranging: boolean
): SizedPane[] {
	return authored.map((pane) => ({
		id: pane.id,
		x: pane.x,
		y: pane.y,
		w: pane.w,
		h: reservedRows(pane, specs[pane.id]?.content ?? 'flow', measured[pane.id], arranging)
	}));
}
