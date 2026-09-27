// The one place the sizings differ: a chart scales to its height, a list's modes differ in who owns it.

import { COLS, rowsForPx } from './units';
import type { AuthoredPane, HeightMode, PaneContent, PaneSpec, SizedPane } from './types';

/** The spans a pane's content turned out to need, in units. 0 on an axis never measured. */
export interface ContentFloor {
	w: number;
	h: number;
}

/** A `scale` pane is always `fixed`: with no content height, fitting would collapse it to its floor. */
export function effectiveMode(content: PaneContent, mode: HeightMode): HeightMode {
	return content === 'scale' ? 'fixed' : mode;
}

export function hugs(mode: HeightMode): boolean {
	return mode === 'fit' || mode === 'cap';
}

export function scrolls(content: PaneContent, mode: HeightMode): boolean {
	return content === 'flow' && mode !== 'fit';
}

/** A capped pane reserves its content up to the ceiling, arranging or not, or the board shifts when Edit
    closes. */
export function reservedRows(
	authored: AuthoredPane,
	content: PaneContent,
	measured: number | undefined
): number {
	const mode = effectiveMode(content, authored.mode);
	if (mode === 'fixed') return authored.h;

	// No measurement yet (first render, or a folded board that never measured): the authored height
	// stops the board collapsing for one frame.
	const rows = measured === undefined ? authored.h : rowsForPx(measured);
	if (mode === 'fit') return rows;
	return Math.min(rows, authored.cap);
}

/** Only `scale`: `fit` and `cap` already track content, and `flow` scrolls instead of growing. */
function growsTaller(content: PaneContent): boolean {
	return content === 'scale';
}

/** A whole board's authored panes as the rectangles the collision pass reads, each raised to the spans its
    content turned out to need. Widening shifts a pane left off the right edge rather than overrunning it. */
export function sizePanes(
	authored: AuthoredPane[],
	specs: Record<string, PaneSpec>,
	measured: Record<string, number>,
	floors: Record<string, ContentFloor>
): SizedPane[] {
	return authored.map((pane) => {
		const content = specs[pane.id]?.content ?? 'flow';
		const floor = floors[pane.id];
		const rows = reservedRows(pane, content, measured[pane.id]);
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
