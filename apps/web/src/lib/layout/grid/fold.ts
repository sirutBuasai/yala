// Coordinates are dropped rather than rescaled. The DOM keeps the declaration order and tab order; reading
// order decides where each pane is drawn.

import { COLS } from './units';
import type { PlacedPane } from './types';

/** Row-major reading order for a resolved board, as an id → order index map. */
export function readingOrder(placed: PlacedPane[]): Record<string, number> {
	const sorted = [...placed].sort((a, b) => a.y - b.y || a.x - b.x);
	return Object.fromEntries(sorted.map((p, i) => [p.id, i]));
}

/** A pane over half the full board was its region's principal figure, so it keeps the whole width. */
export function foldSpan(w: number, cols: number): number {
	return cols > 1 && w * 2 > COLS ? cols : 1;
}

/** Where a pane is drawn on a board folded into several columns, in `STACK_ROW` rows. */
export interface Stack {
	col: number;
	row: number;
	rows: number;
	span: number;
}

/** Each pane, in reading order, tops up the shortest column; a full-width one starts below them all, and a
    pane with no neighbour between full-width ones takes the full width too. Before each full-width pane and at
    the foot, the last pane of every shorter column is stretched level, so no column is left with a gap beside
    a taller neighbour. `rows` is each card's own height; a stretch only adds to it. */
export function stackColumns(
	panes: { id: string; span: number; rows: number }[],
	cols: number
): Record<string, Stack> {
	const out: Record<string, Stack> = {};
	const bottoms = new Array<number>(cols).fill(0);
	const lastIn = new Array<string | undefined>(cols).fill(undefined);
	const wideAt = (i: number) => (panes[i]?.span ?? cols) >= cols;

	const level = (): number => {
		const floor = Math.max(...bottoms);
		bottoms.forEach((bottom, c) => {
			const id = lastIn[c];
			if (id) out[id]!.rows += floor - bottom;
		});
		bottoms.fill(floor);
		lastIn.fill(undefined);
		return floor;
	};

	panes.forEach(({ id, span, rows }, i) => {
		if (span >= cols || (wideAt(i - 1) && wideAt(i + 1))) {
			const row = level();
			out[id] = { col: 0, row, rows, span: cols };
			bottoms.fill(row + rows);
			return;
		}
		const col = bottoms.indexOf(Math.min(...bottoms));
		out[id] = { col, row: bottoms[col]!, rows, span };
		bottoms[col] = bottoms[col]! + rows;
		lastIn[col] = id;
	});
	level();
	return out;
}
