// How many rows a pane reserves — the one place the sizings differ. A chart takes the height it was
// given and scales to fill it; a list's three modes differ only in who owns the height and whether
// that ownership has a ceiling.

import { COLS, rowsForPx } from './units';
import type { AuthoredPane, HeightMode, PaneContent, PaneSpec, SizedPane } from './types';

/** The spans a pane's content turned out to need, in units. 0 on an axis never measured. */
export interface ContentFloor {
	w: number;
	h: number;
}

/**
 * The height mode a pane actually runs in. A `scale` pane is always `fixed`: with no content height
 * of its own, fitting it would collapse it to its floor and call that an answer.
 */
export function effectiveMode(content: PaneContent, mode: HeightMode): HeightMode {
	return content === 'scale' ? 'fixed' : mode;
}

export function hugs(mode: HeightMode): boolean {
	return mode === 'fit' || mode === 'cap';
}

export function scrolls(content: PaneContent, mode: HeightMode): boolean {
	return content === 'flow' && mode !== 'fit';
}

/**
 * Rows a pane reserves on the board. While ARRANGING, a capped pane reserves its whole ceiling even
 * when the list has not reached it — otherwise the user places a neighbour in space the list is
 * entitled to grow into, and a little more data shoves it back out again.
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
	// stops the board collapsing for one frame.
	const rows = measured === undefined ? authored.h : rowsForPx(measured);
	if (mode === 'fit') return rows;
	return arranging ? authored.cap : Math.min(rows, authored.cap);
}

/**
 * Height a content floor may raise. Only `scale`, whose height nothing else owns: a `fit` or `cap` pane
 * already tracks its content both ways, and a `flow` pane on a set height scrolls instead of growing.
 */
function growsTaller(content: PaneContent): boolean {
	return content === 'scale';
}

/** A whole board's authored panes as the rectangles the collision pass reads, each raised to the spans its
    content turned out to need. Widening shifts a pane left off the right edge rather than overrunning it. */
export function sizePanes(
	authored: AuthoredPane[],
	specs: Record<string, PaneSpec>,
	measured: Record<string, number>,
	floors: Record<string, ContentFloor>,
	arranging: boolean
): SizedPane[] {
	return authored.map((pane) => {
		const content = specs[pane.id]?.content ?? 'flow';
		const floor = floors[pane.id];
		const rows = reservedRows(pane, content, measured[pane.id], arranging);
		const w = Math.min(COLS, Math.max(pane.w, floor?.w ?? 0));
		return {
			id: pane.id,
			x: Math.min(COLS - w, pane.x),
			y: pane.y,
			w,
			h: growsTaller(content) ? Math.max(rows, floor?.h ?? 0) : rows
		};
	});
}
