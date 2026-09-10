// Merging KPI cards: the geometry of which pair may join, and the bookkeeping of the groups that
// result. Pure — no DOM, no Svelte, no storage.
//
// A group's FIRST id is also the board's pane id for the whole card. That is the load-bearing
// choice: merging then edits a pane the board already has a stored rectangle for, so a merged card
// keeps the position and size the user gave it instead of being a new pane placed at the back.

import { MIN_H, MIN_W } from '$lib/layout/grid/units';
import type { Rect } from '$lib/layout/grid/types';

/** Which way a merged card runs. Always flat — one row or one column, never a grid. */
export type MergeAxis = 'row' | 'column';

export interface KpiGroup {
	/** Member KPI ids in section order. The first is the group's pane id on the board. */
	ids: string[];
	axis: MergeAxis;
	/** Each section's span along the axis, so sections keep their relative sizes on resize. */
	weights: number[];
}

/** A group of one — what every KPI is until the user merges it. */
function alone(id: string, rect: Rect): KpiGroup {
	return { ids: [id], axis: 'row', weights: [rect.w] };
}

/**
 * Can these two cards merge, and along which axis? They must ABUT and match on the shared axis:
 * same height when side by side, same width when stacked. Anything else would need a section to
 * change shape, which a flat card cannot express.
 */
export function mergeAxis(a: Rect, b: Rect): MergeAxis | null {
	if (a.y === b.y && a.h === b.h && a.x + a.w === b.x) return 'row';
	if (a.x === b.x && a.w === b.w && a.y + a.h === b.y) return 'column';
	return null;
}

export function unionRect(a: Rect, b: Rect): Rect {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** The bounding box of several rectangles — a merged card's default position. */
export function boundsOf(rects: Rect[]): Rect {
	return rects.reduce((box, r) => unionRect(box, r));
}

/**
 * A merged card has NO floor of its own beyond the board's: it clips its sections rather than refusing
 * to be resized (see `KpiPane`), so it shrinks exactly as far as any other pane.
 */
const MIN_SPAN = { row: MIN_W, column: MIN_H } as const;

/**
 * The groups a board actually has: the stored ones filtered down to KPIs that still exist, then a
 * group of one for every KPI no stored group claimed, in declaration order. A stored group reduced
 * to a single member stops being a merge, so it rejoins the singletons at its declared position.
 */
export function groupsFor(rects: Record<string, Rect>, stored: KpiGroup[]): KpiGroup[] {
	const claimed = new Set<string>();
	const merged: KpiGroup[] = [];

	for (const group of stored) {
		// `claimed` grows as the filter runs, so a member already taken — by an earlier group, or by an
		// earlier slot in THIS one — is dropped rather than rendered twice under the same key.
		const ids = group.ids.filter((id) => {
			if (!rects[id] || claimed.has(id)) return false;
			claimed.add(id);
			return true;
		});
		if (ids.length < 2) {
			for (const id of ids) claimed.delete(id);
			continue;
		}
		merged.push({
			ids,
			axis: group.axis,
			weights: ids.map(
				(id) =>
					group.weights[group.ids.indexOf(id)] ??
					(group.axis === 'row' ? rects[id]!.w : rects[id]!.h)
			)
		});
	}

	// Declaration order, so an unmerged board reads the way the view wrote it.
	const singles = Object.keys(rects)
		.filter((id) => !claimed.has(id))
		.map((id) => alone(id, rects[id]!));

	return orderByPosition(rects, [...merged, ...singles]);
}

/** Groups sorted by where their leader sits, so the board's panes are declared top-left first. */
function orderByPosition(rects: Record<string, Rect>, groups: KpiGroup[]): KpiGroup[] {
	const at = (g: KpiGroup) => rects[g.ids[0]!]!;
	return [...groups].sort((a, b) => at(a).y - at(b).y || at(a).x - at(b).x);
}

/**
 * Join the groups led by `a` and `b` into one. Section order follows the axis — the group whose
 * leader sits first keeps the lead — and each section's weight is the span it had, so the merged
 * card looks exactly like the two cards did with the gap between them closed.
 */
export function mergeGroups(
	groups: KpiGroup[],
	a: string,
	b: string,
	axis: MergeAxis,
	spanOf: (id: string) => number
): KpiGroup[] {
	const first = groups.find((g) => g.ids[0] === a);
	const second = groups.find((g) => g.ids[0] === b);
	if (!first || !second) return groups;

	const ids = [...first.ids, ...second.ids];
	// A group of one has no axis of its own, and either side may already be merged the OTHER way; the
	// spans of the leaders are what the new card is built from, so its own axis wins.
	const weights = ids.map(
		(id) =>
			(first.ids.length > 1 && first.axis === axis
				? first.weights[first.ids.indexOf(id)]
				: undefined) ??
			(second.ids.length > 1 && second.axis === axis
				? second.weights[second.ids.indexOf(id)]
				: undefined) ??
			spanOf(id)
	);

	return [{ ids, axis, weights }, ...groups.filter((g) => g !== first && g !== second)];
}

/**
 * Split the group led by `leader` at the divider before section `index`. Both halves keep their
 * sections' relative sizes; the right/lower half is led by the section the divider was in front of.
 */
export function splitGroup(groups: KpiGroup[], leader: string, index: number): KpiGroup[] {
	const group = groups.find((g) => g.ids[0] === leader);
	if (!group || index < 1 || index >= group.ids.length) return groups;

	const halves: KpiGroup[] = [
		{ ids: group.ids.slice(0, index), axis: group.axis, weights: group.weights.slice(0, index) },
		{ ids: group.ids.slice(index), axis: group.axis, weights: group.weights.slice(index) }
	];

	return [...halves.filter((h) => h.ids.length > 1), ...groups.filter((g) => g !== group)];
}

/**
 * How a split divides the merged card's rectangle: each half takes the share of the axis its sections
 * held, in whole units, and never below the room the sections it keeps need — so neither half comes
 * back out of storage widened onto the other one.
 */
export function splitRects(group: KpiGroup, rect: Rect, index: number): [Rect, Rect] {
	const total = group.weights.reduce((a, w) => a + w, 0) || 1;
	const before = group.weights.slice(0, index).reduce((a, w) => a + w, 0);
	const axis = group.axis;
	const span = axis === 'row' ? rect.w : rect.h;

	// Each half only has to be a legal rectangle. A card already at the board's minimum cannot give
	// both halves one, so the second is left overlapping and the push rule sends it below — the honest
	// outcome for splitting a card with no room to split.
	const floor = MIN_SPAN[axis];
	const kept = Math.max(
		floor,
		Math.min(Math.max(floor, span - floor), Math.round((before / total) * span))
	);

	return axis === 'row'
		? [
				{ ...rect, w: kept },
				{ ...rect, x: rect.x + kept, w: rect.w - kept }
			]
		: [
				{ ...rect, h: kept },
				{ ...rect, y: rect.y + kept, h: rect.h - kept }
			];
}

/** Fraction of the axis each divider sits at — where a split control goes, and where the rule is. */
export function dividerFractions(weights: number[]): number[] {
	const total = weights.reduce((a, w) => a + w, 0) || 1;
	const out: number[] = [];
	let run = 0;
	for (const w of weights.slice(0, -1)) {
		run += w;
		out.push(run / total);
	}
	return out;
}
