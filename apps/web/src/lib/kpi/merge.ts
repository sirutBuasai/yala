// Merging KPI cards: which pair may join, and the groups that result. Pure — no DOM, no storage.
//
// A group's FIRST id is also the board's pane id for the whole card, so merging edits a pane the
// board already has a stored rectangle for and the merged card keeps the size the user gave it.

import { MIN_H, MIN_W } from '$lib/layout/grid/units';
import type { Rect } from '$lib/layout/grid/types';

/** Which way a merged card runs. Always flat, never a grid. */
export type MergeAxis = 'row' | 'column';

export interface KpiGroup {
	/** Member KPI ids in section order. The first is the group's pane id on the board. */
	ids: string[];
	axis: MergeAxis;
	/** Each section's span along the axis, so sections keep their relative sizes on resize. */
	weights: number[];
}

function alone(id: string, rect: Rect): KpiGroup {
	return { ids: [id], axis: 'row', weights: [rect.w] };
}

/**
 * Which axis these two may merge along, if any. They must abut and match on the shared edge; anything
 * else would need a section to change shape, which a flat card cannot express.
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

/** A merged card's default position. */
export function boundsOf(rects: Rect[]): Rect {
	return rects.reduce((box, r) => unionRect(box, r));
}

const MIN_SPAN = { row: MIN_W, column: MIN_H } as const;

/**
 * The groups a board actually has: stored ones filtered to KPIs that still exist, then a group of one
 * for each KPI left over. A group reduced to one member stops being a merge and rejoins the rest.
 */
export function groupsFor(rects: Record<string, Rect>, stored: KpiGroup[]): KpiGroup[] {
	const claimed = new Set<string>();
	const merged: KpiGroup[] = [];

	for (const group of stored) {
		// `claimed` grows as the filter runs, so a member taken by an earlier group — or by an earlier slot
		// in this one — is dropped rather than rendered twice under the same key.
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

	const singles = Object.keys(rects)
		.filter((id) => !claimed.has(id))
		.map((id) => alone(id, rects[id]!));

	return orderByPosition(rects, [...merged, ...singles]);
}

/** Sorted by where each leader sits, so the board's panes are declared top-left first. */
function orderByPosition(rects: Record<string, Rect>, groups: KpiGroup[]): KpiGroup[] {
	const at = (g: KpiGroup) => rects[g.ids[0]!]!;
	return [...groups].sort((a, b) => at(a).y - at(b).y || at(a).x - at(b).x);
}

/**
 * Join the groups led by `a` and `b`. Each section keeps the span it had, so the merged card looks
 * like the two did with the gap between them closed.
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

	// A group of one has no axis, and either side may already be merged the other way, so only weights
	// from a group running the SAME way carry over.
	const ids = [...first.ids, ...second.ids];
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

/** Split at the divider before section `index`. The far half is led by the section it sat in front of. */
export function splitGroup(groups: KpiGroup[], leader: string, index: number): KpiGroup[] {
	const group = groups.find((g) => g.ids[0] === leader);
	if (!group || index < 1 || index >= group.ids.length) return groups;

	const halves: KpiGroup[] = [
		{ ids: group.ids.slice(0, index), axis: group.axis, weights: group.weights.slice(0, index) },
		{ ids: group.ids.slice(index), axis: group.axis, weights: group.weights.slice(index) }
	];

	return [...halves.filter((h) => h.ids.length > 1), ...groups.filter((g) => g !== group)];
}

/** How a split divides the card's rectangle: each half takes the share of the axis its sections held. */
export function splitRects(group: KpiGroup, rect: Rect, index: number): [Rect, Rect] {
	const total = group.weights.reduce((a, w) => a + w, 0) || 1;
	const before = group.weights.slice(0, index).reduce((a, w) => a + w, 0);
	const axis = group.axis;
	const span = axis === 'row' ? rect.w : rect.h;

	// A card already at the board's minimum cannot give both halves a legal rectangle, so the second is
	// left overlapping and the push rule sends it below.
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

/** Fraction of the axis each divider sits at. */
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
