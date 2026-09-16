// What a drag does to the board, beyond what the push rule can say on its own. Pure, no DOM.
//
// The dragged pane is a piston: it travels a row at a time, taking whatever it touches in the direction of
// travel. Pushing is the only thing that moves another pane — nothing is towed — so a pane the piston leaves
// behind keeps the position the user gave it. Every step re-derives from the board as the press found it.

import { clampRect, sharesColumns } from './resolve';
import type { AuthoredPane, PlacedPane } from './types';

/** The board as a press found it. */
export interface DragOrigin {
	/** Authored panes, in priority order. */
	authored: AuthoredPane[];
	/** The same board, resolved. */
	placed: PlacedPane[];
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

	// A pane the piston moved is authored where it came to rest, displacement and all: travel the rows
	// instead and a push it was carrying stays latent in the gap above it, springing back the moment the
	// pusher leaves. The cost is that a push the data made is banked as the user's. Panes the piston never
	// reached keep their authored top, so displacement elsewhere stays transient.
	const resting = (p: AuthoredPane) =>
		board.get(p.id)!.y === press.get(p.id)! ? p.y : board.get(p.id)!.y;

	const top = up
		? Math.min(board.get(id)!.y, climbed(id, travel - moved, board, origin.authored))
		: board.get(id)!.y;

	return promoted(
		origin.authored.map((p) =>
			p.id === id ? { ...p, x: column, y: top } : { ...p, y: resting(p) }
		),
		id
	);
}
