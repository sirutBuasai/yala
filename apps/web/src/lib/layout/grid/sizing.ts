// How many rows a pane reserves — the one place the four pane sizings differ.
//
// Charts have exactly one sizing: the pane's height is whatever it was given, and the chart scales
// to fill it. Lists have three, and they differ only in who owns the height and whether that
// ownership has a ceiling.

import { unitsFor } from './units';
import type { HeightMode, Intent, PaneContent, PaneSpec, Sized } from './types';

/**
 * The height mode a pane actually runs in. A `scale` pane is always `fixed`: it has no content
 * height of its own to fit to, so fitting it would collapse it to its floor and call that an
 * answer.
 */
export function effectiveMode(content: PaneContent, mode: HeightMode): HeightMode {
	return content === 'scale' ? 'fixed' : mode;
}

/** Does this pane's card hug its content rather than stretching to the cell? */
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
	intent: Intent,
	content: PaneContent,
	measured: number | undefined,
	arranging: boolean
): number {
	const mode = effectiveMode(content, intent.mode);
	if (mode === 'fixed') return intent.h;

	// No measurement yet (first render, or a folded board that never measured): the authored height
	// is the best available guess and stops the board collapsing for one frame.
	const rows = measured === undefined ? intent.h : unitsFor(measured);
	if (mode === 'fit') return rows;
	return arranging ? intent.cap : Math.min(rows, intent.cap);
}

/** Resolve a whole board's intents into the rectangles the collision pass reads. */
export function sizeAll(
	intents: Intent[],
	specs: Record<string, PaneSpec>,
	measured: Record<string, number>,
	arranging: boolean
): Sized[] {
	return intents.map((intent) => ({
		id: intent.id,
		x: intent.x,
		y: intent.y,
		w: intent.w,
		h: reservedRows(intent, specs[intent.id]?.content ?? 'flow', measured[intent.id], arranging)
	}));
}
