// Row and cell shapes for `StatMatrix.svelte`. Cells are catalog ids, so a row is data, not markup.

import type { Scope } from '$lib/data/scope';
import type { Label } from '$lib/ui/label';

export interface StatCell {
	id: string;
	scope: Scope;
}

export interface StatRow {
	label: Label;
	/** Small print under the row label. */
	caption?: Label;
	cells: StatCell[];
}

/** One row's cells: an ordered list of catalog ids, all read at the same scope. */
export function statCells(ids: string[], scope: Scope): StatCell[] {
	return ids.map((id) => ({ id, scope }));
}
