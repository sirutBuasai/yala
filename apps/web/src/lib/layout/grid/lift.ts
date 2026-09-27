// Pure. The dragged pane is a piston: pushing is the only thing that moves another pane, and every step
// re-derives from the board as the press found it.

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

/** Transitive; a pane with slack between is free, so it is not in the group. */
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

/** Upward it is refused unless all of them can move: a pane at the top means the stack is full. */
function step(id: string, up: boolean, board: Board): boolean {
	const group = touching(id, up, board);
	if (up && group.some((q) => q.y === 0)) return false;
	for (const q of group) q.y += up ? -1 : 1;
	return true;
}

/** Unabsorbed travel carries the pane over those above; matching a cleared pane's top takes its spot. */
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

/** `x, y` are in placed coordinates, where the pane is on screen. */
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

	// Authored where it came to rest: travelling the rows left a push latent to spring back. Panes never reached
	// keep their authored top.
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
