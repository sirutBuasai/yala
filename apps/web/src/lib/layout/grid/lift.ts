// What a drag does to the board, beyond what the push rule can say on its own. Pure, no DOM.
//
// `resolve` only ever sends panes DOWN and treats an authored top as a floor, so a drag on its own gets
// two things wrong. Upward, nothing happens until the pane's authored top has cleared the whole height
// of its neighbour, and then it jumps. Downward, the panes below are shoved along but their authored
// tops stay where they were, so the moment the dragged pane's top passes one of them that pane wins the
// slot on authored order and the two flip places. One gesture answers both:
//
//   PUSH  the dragged pane is a piston. It travels a row at a time, taking with it whatever it is
//         TOUCHING in the direction it is going — resting on, going up; resting on it, going down. A
//         pane with slack between is free there and stays put. Every pane the piston moves has its
//         authored top moved with it, which is what keeps the order stable and the push reloadable.
//   SWAP  only travel the piston could NOT absorb climbs over the pane above, so an upward drag has to
//         clear its whole height. Going down there is no bottom edge to run out of, so a downward drag
//         pushes for ever and never reorders: taking a pane's place is the upward gesture's job.
//
// Everything re-derives from the board as the PRESS found it, never from the board the gesture is
// already editing: the same fixed-origin rule the pointer deltas follow, and what lets a drag back
// undo a swap exactly.

import { authoredY, clampRect, resolve, sharesColumns } from './resolve';
import type { AuthoredPane, PlacedPane, SizedPane, Span } from './types';

/** The board as a press found it. */
export interface DragOrigin {
	/** Authored panes, in priority order. */
	authored: AuthoredPane[];
	/** The same board, resolved. */
	placed: PlacedPane[];
	/** Displacement the dragged pane was carrying. */
	carried: number;
}

/** What a pane occupies while the piston is being simulated: its columns and the height it RESERVES. */
interface Band extends Span {
	h: number;
}

type Tops = Map<string, number>;
type Bands = Map<string, Band>;

/**
 * The panes `id` is touching in the direction of travel, transitively — what has to move before it can.
 * `up` walks to what it is resting ON, otherwise to what is resting on IT. A pane with slack between is
 * not in the group: it is free there, so nothing has to move for it.
 */
function touching(id: string, up: boolean, tops: Tops, bands: Bands): Set<string> {
	const group = new Set([id]);
	const queue = [id];
	while (queue.length) {
		const from = queue.pop()!;
		const band = bands.get(from)!;
		const edge = up ? tops.get(from)! : tops.get(from)! + band.h;
		for (const [q, qb] of bands) {
			if (group.has(q) || !sharesColumns(band, qb)) continue;
			if ((up ? tops.get(q)! + qb.h : tops.get(q)!) !== edge) continue;
			group.add(q);
			queue.push(q);
		}
	}
	return group;
}

/**
 * One row of travel, for the pane and the whole group it is pushing. Upward it is refused unless every
 * one of them can move: one pane against the top of the board is the stack being full, not an
 * invitation to leave it behind and open an overlap. Downward the board has no edge to refuse it.
 */
function step(id: string, up: boolean, tops: Tops, bands: Bands): boolean {
	const group = touching(id, up, tops, bands);
	if (up && [...group].some((q) => tops.get(q) === 0)) return false;
	for (const q of group) tops.set(q, tops.get(q)! + (up ? -1 : 1));
	return true;
}

/**
 * The authored top an upward drag climbs to. Travel the piston could not absorb carries the pane over
 * the panes above it, and matching a cleared pane's authored top is enough to take its spot, since the
 * drag is promoted.
 */
function climbed(id: string, over: number, tops: Tops, bands: Bands, origin: DragOrigin): number {
	const from = tops.get(id)!;
	const reach = from - over;
	let top = from;
	for (const q of origin.authored) {
		const above = tops.get(q.id);
		if (q.id === id || above === undefined || above >= from) continue;
		if (reach <= above && sharesColumns(bands.get(id)!, bands.get(q.id)!)) top = Math.min(top, q.y);
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
 * The whole authored board after one pointer move of a drag, in PLACED coordinates — `x, y` are where
 * the pane is on screen.
 */
export function lift(id: string, x: number, y: number, origin: DragOrigin): AuthoredPane[] {
	const self = origin.authored.find((p) => p.id === id);
	const base = origin.placed.find((p) => p.id === id);
	if (!self || !base) return origin.authored;

	const travel = base.y - y;
	const up = travel > 0;

	const from: Tops = new Map(origin.placed.map((q) => [q.id, q.y]));
	const tops: Tops = new Map(from);
	const bands: Bands = new Map(origin.placed.map((q) => [q.id, { x: q.x, w: q.w, h: q.h }]));
	// The piston works on the columns the pointer has taken the pane to, not the ones it left.
	const column = clampRect({ x, y, w: self.w, h: base.h }).x;
	bands.set(id, { x: column, w: base.w, h: base.h });

	let moved = 0;
	while (moved < Math.abs(travel) && step(id, up, tops, bands)) moved++;

	// Every pane the piston moved keeps the displacement it was carrying: its authored top travels the
	// same rows rather than being set to where the pane came to rest. Set it, and a pane that a GROWING
	// neighbour had pushed down to here would store that push as though the user had asked for it —
	// which for the dragged pane itself is exactly what `authoredY` is subtracting back out.
	const shifted = (p: AuthoredPane) =>
		Math.max(0, p.y + ((tops.get(p.id) ?? 0) - (from.get(p.id) ?? 0)));

	const top = up
		? Math.min(shifted(self), climbed(id, travel - moved, tops, bands, origin))
		: authoredY(tops.get(id)!, origin.carried);

	let panes = promoted(
		origin.authored.map((p) =>
			p.id === id ? { ...p, x: column, y: top } : { ...p, y: shifted(p) }
		),
		id
	);
	// Going down, `resolve` cascades the rest on its own from the tops the piston just wrote.
	if (!up) return panes;

	// Heights come from the RESOLVED board, since a fitted pane reserves what it measured rather than
	// what it declared, and re-resolving on the declared height would misplace every pane below it.
	const sized = (board: AuthoredPane[]): SizedPane[] =>
		board.map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: bands.get(p.id)?.h ?? p.h }));

	// Now the panes lower down. Each comes up by however far the nearest pane above it has ACTUALLY come
	// up, which is why the board is re-resolved as we go: a pane that was only ever pushed down here has
	// an authored top that never moved, and following that would leave a hole where the push used to be.
	// A single unmoved neighbour in any column a pane spans keeps it exactly where it is.
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
