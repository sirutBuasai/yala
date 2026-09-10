// What a drag does to the board, beyond what the push rule can say on its own. Pure, no DOM.
//
// The dragged pane is a piston: it travels a row at a time, taking with it whatever it TOUCHES in the
// direction it is going, and every pane it moves has its authored top moved with it. Everything
// re-derives from the board as the PRESS found it, never from the board the gesture is already
// editing — the same fixed-origin rule the pointer deltas follow.

import { authoredY, clampRect, resolve, sharesColumns } from './resolve';
import type { AuthoredPane, PlacedPane, SizedPane } from './types';

/** The board as a press found it. */
export interface DragOrigin {
	/** Authored panes, in priority order. */
	authored: AuthoredPane[];
	/** The same board, resolved. */
	placed: PlacedPane[];
	/** Displacement the dragged pane was carrying. */
	carried: number;
}

type Board = Map<string, PlacedPane>;

/**
 * The panes `id` touches in the direction of travel, transitively — what has to move before it can.
 * A pane with slack between is not in the group: it is free there, so nothing has to move for it.
 */
function touching(id: string, up: boolean, board: Board): PlacedPane[] {
	const group = new Map<string, PlacedPane>([[id, board.get(id)!]]);
	const queue = [board.get(id)!];
	while (queue.length) {
		const from = queue.pop()!;
		const edge = up ? from.y : from.y + from.h;
		for (const q of board.values()) {
			if (group.has(q.id) || !sharesColumns(from, q)) continue;
			if ((up ? q.y + q.h : q.y) !== edge) continue;
			group.set(q.id, q);
			queue.push(q);
		}
	}
	return [...group.values()];
}

/**
 * One row of travel, for the pane and the whole group it is pushing. Upward it is refused unless
 * every one of them can move: one pane against the top of the board is the stack being full, not an
 * invitation to leave it behind and open an overlap.
 */
function step(id: string, up: boolean, board: Board): boolean {
	const group = touching(id, up, board);
	if (up && group.some((q) => q.y === 0)) return false;
	for (const q of group) q.y += up ? -1 : 1;
	return true;
}

/**
 * The authored top an upward drag climbs to. Travel the piston could not absorb carries the pane over
 * the panes above it, and matching a cleared pane's authored top is enough to take its spot, since the
 * drag is promoted. Downward there is no bottom edge to run out of, so nothing ever climbs.
 */
function climbed(id: string, over: number, board: Board, authored: AuthoredPane[]): number {
	const self = board.get(id)!;
	const reach = self.y - over;
	let top = self.y;
	for (const q of authored) {
		const now = board.get(q.id);
		if (q.id === id || !now || now.y >= self.y) continue;
		if (reach <= now.y && sharesColumns(self, now)) top = Math.min(top, q.y);
	}
	return top;
}

/**
 * The panes directly above `pane`: the nearest one in each column it spans. A column with nothing
 * above contributes none rather than the board's top edge — the pane is free there, so nothing in
 * that column can hold it back.
 */
function directlyAbove(placed: PlacedPane[], pane: PlacedPane): PlacedPane[] {
	const nearest = new Map<string, PlacedPane>();
	for (let col = pane.x; col < pane.x + pane.w; col++) {
		let best: PlacedPane | undefined;
		for (const q of placed) {
			if (q.id === pane.id || col < q.x || col >= q.x + q.w || q.y + q.h > pane.y) continue;
			if (!best || q.y + q.h > best.y + best.h) best = q;
		}
		if (best) nearest.set(best.id, best);
	}
	return [...nearest.values()];
}

/** The dragged pane first: the priority order's way of saying it wins ties on authored top. */
function promoted(panes: AuthoredPane[], id: string): AuthoredPane[] {
	const self = panes.find((p) => p.id === id)!;
	return [self, ...panes.filter((p) => p.id !== id)];
}

/**
 * The whole authored board after one pointer move of a drag. `x, y` are in PLACED coordinates —
 * where the pane is on screen.
 */
export function lift(id: string, x: number, y: number, origin: DragOrigin): AuthoredPane[] {
	const self = origin.authored.find((p) => p.id === id);
	const start = origin.placed.find((p) => p.id === id);
	if (!self || !start) return origin.authored;

	const travel = start.y - y;
	const up = travel > 0;

	const press = new Map(origin.placed.map((q) => [q.id, q.y]));
	const board: Board = new Map(origin.placed.map((q) => [q.id, { ...q }]));
	// The piston works on the columns the pointer has taken the pane to, not the ones it left.
	const column = clampRect({ x, y, w: self.w, h: start.h }).x;
	board.get(id)!.x = column;

	let moved = 0;
	while (moved < Math.abs(travel) && step(id, up, board)) moved++;

	// Every pane the piston moved keeps the displacement it was carrying: its authored top travels the
	// same rows rather than being set to where the pane came to rest. Set it, and a pane that a GROWING
	// neighbour had pushed down to here would store that push as though the user had asked for it —
	// which for the dragged pane itself is what `authoredY` subtracts back out.
	const shifted = (p: AuthoredPane) => Math.max(0, p.y + (board.get(p.id)!.y - press.get(p.id)!));

	const top = up
		? Math.min(shifted(self), climbed(id, travel - moved, board, origin.authored))
		: authoredY(board.get(id)!.y, origin.carried);

	let panes = promoted(
		origin.authored.map((p) =>
			p.id === id ? { ...p, x: column, y: top } : { ...p, y: shifted(p) }
		),
		id
	);
	// Going down, `resolve` cascades the rest on its own from the tops the piston just wrote.
	if (!up) return panes;

	// Heights come from the RESOLVED board: a fitted pane reserves what it measured, not what it
	// declared, and re-resolving on the declared height would misplace every pane below it.
	const sized = (of: AuthoredPane[]): SizedPane[] =>
		of.map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: board.get(p.id)?.h ?? p.h }));

	// Now the panes lower down. Each comes up by however far the nearest pane above it has ACTUALLY
	// come up, which is why the board is re-resolved as we go: a pane that was only ever pushed down
	// here has an authored top that never moved, and following that would leave a hole where the push
	// used to be. A single unmoved neighbour in any column a pane spans keeps it where it is.
	for (const pane of [...origin.placed].sort((a, b) => a.y - b.y)) {
		const above = directlyAbove(origin.placed, pane);
		const authored = panes.find((p) => p.id === pane.id);
		if (pane.id === id || !above.length || !authored) continue;

		const now = new Map(resolve(sized(panes)).map((q) => [q.id, q]));
		const falls = Math.min(...above.map((q) => q.y - now.get(q.id)!.y));
		if (falls <= 0) continue;

		// Never past the new bottom of what it is following, which is what keeps the gap it was left.
		const floor = above.reduce((v, q) => Math.max(v, now.get(q.id)!.y + now.get(q.id)!.h), 0);
		const next = Math.min(authored.y, Math.max(authored.y - falls, floor));
		if (next !== authored.y) panes = panes.map((p) => (p.id === pane.id ? { ...p, y: next } : p));
	}

	return panes;
}
