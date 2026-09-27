// Which milestone labels share a label on the timeline, so none prints over another however close their
// years: labels that would collide merge into one, laid over the span of their points.

export interface LabelGroup {
	/** Indexes of the milestones this label names, in order. */
	members: number[];
	/** From the timeline's left edge, in px, held inside it. */
	left: number;
	width: number;
}

/** Labels centred on `at` (px, in order), the closest colliding neighbours merging first until each clears
    the next by `gap`. Every label is held inside `room`. */
export function groupLabels(
	at: number[],
	widthOf: (members: number[]) => number,
	room: number,
	gap = 8
): LabelGroup[] {
	const place = (members: number[]): LabelGroup => {
		const width = widthOf(members);
		const centre = (at[members[0]!]! + at[members.at(-1)!]!) / 2;
		const left = Math.min(Math.max(centre - width / 2, 0), Math.max(0, room - width));
		return { members, left, width };
	};

	let groups = at.map((_, i) => place([i]));
	for (;;) {
		const clash = groups.findIndex(
			(g, i) => i < groups.length - 1 && g.left + g.width + gap > groups[i + 1]!.left
		);
		if (clash === -1) return groups;
		const merged = place([...groups[clash]!.members, ...groups[clash + 1]!.members]);
		groups = [...groups.slice(0, clash), merged, ...groups.slice(clash + 2)];
	}
}

/** The rail's thinnest and thickest, what it gains per grid row of height past the pane's floor, and how far
    each dot overhangs it, in px. */
export const RAIL = { least: 6, most: 24, step: 6, dotOver: 12 } as const;

/** The rail's row at its least and most: the rail with its dots' overhang, from thinnest to thickest. */
export function barRange(row: number): { least: number; most: number } {
	const least = RAIL.least + RAIL.dotOver;
	return { least, most: least + ((RAIL.most - RAIL.least) / RAIL.step) * row };
}

/** Thickened by whole grid rows past its least: taken per pixel, the rail's thickness at the floor varied
    from plan to plan. */
export function railThickness(height: number, row: number): number {
	const rows = Math.floor(Math.max(0, height - barRange(row).least) / row);
	return Math.min(RAIL.most, RAIL.least + rows * RAIL.step);
}
