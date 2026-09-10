// One board's KPI grouping: which cards the user has merged, and the pane table that follows from
// it. Runes only, no DOM.
//
// The merges are persisted separately from the arrangement because they are a different kind of
// decision — WHICH panes the board has, rather than where those panes sit. The arrangement stores
// the rectangles; this stores the sections inside them.

import { listOf, oneOf, Pref, type Revive } from '$lib/utils/persist.svelte';
import type { BoardLayout, PaneSpec, Rect } from '$lib/layout/grid/types';
import {
	boundsOf,
	dividerFractions,
	groupsFor,
	mergeGroups,
	splitGroup,
	splitRects,
	type KpiGroup,
	type MergeAxis
} from './merge';
import type { KpiBoardDefs, KpiSpec } from './spec';

const axisOf = oneOf<MergeAxis>(['row', 'column']);

/** Reviver for stored groups. A group whose ids or weights are half-read is dropped: the rest of the
    board is still valid, and a mangled group would render sections against the wrong figures. */
function storedGroups(): Revive<KpiGroup[]> {
	return listOf((raw) => {
		if (typeof raw !== 'object' || raw === null) return undefined;
		const o = raw as Record<string, unknown>;
		const axis = axisOf(o.axis);
		const ids = Array.isArray(o.ids) && o.ids.every((v) => typeof v === 'string') ? o.ids : null;
		const weights =
			Array.isArray(o.weights) && o.weights.every((v) => typeof v === 'number' && v > 0)
				? (o.weights as number[])
				: null;
		if (!axis || !ids || !weights || ids.length !== weights.length || ids.length < 2) {
			return undefined;
		}
		return { ids: ids as string[], axis, weights };
	});
}

export class KpiBoard {
	/** A getter, not a value: a KPI's SCOPE follows the period the view is showing, so the defs are
	    live. Only their rectangles are static, which is why the pane table can be derived from them. */
	readonly #defs: () => KpiBoardDefs;
	readonly #pref: Pref<KpiGroup[]>;

	constructor(key: string, defs: () => KpiBoardDefs) {
		this.#defs = defs;
		this.#pref = new Pref<KpiGroup[]>(`kpi-${key}`, [], storedGroups());
	}

	// `$derived.by` throughout: a field initialiser runs BEFORE the constructor body, so reading a
	// private field directly here would read it before it is assigned.
	readonly #rects = $derived.by<Record<string, Rect>>(() =>
		Object.fromEntries(Object.entries(this.#defs()).map(([id, d]) => [id, d.rect]))
	);

	readonly groups = $derived.by(() => groupsFor(this.#rects, this.#pref.value));

	/** The KPI panes for the board's layout table, keyed by each group's leader. */
	readonly layout = $derived.by<BoardLayout>(() =>
		Object.fromEntries(
			this.groups.map((g): [string, PaneSpec] => [
				g.ids[0]!,
				{ ...boundsOf(g.ids.map((id) => this.#rects[id]!)), content: 'scale' }
			])
		)
	);

	/**
	 * This board's whole pane table: the KPI cards first, so they lead the priority order, then the
	 * view's own panes. Refuses an id used twice — a collision merely SHADOWS one of the two entries,
	 * so the pane it belonged to vanishes from the board with nothing to say it went.
	 *
	 * MUST be called inside a `$derived`: merging changes which panes this returns, and a table
	 * computed once leaves the board reserving rows for a pane nothing renders any more.
	 */
	board<T extends BoardLayout>(panes: T): T & BoardLayout {
		const defs = this.#defs();
		for (const id of Object.keys(panes)) {
			if (defs[id]) throw new Error(`kpi: pane id "${id}" is already a KPI on this board`);
		}
		return { ...this.layout, ...panes };
	}

	group(leader: string): KpiGroup {
		const found = this.groups.find((g) => g.ids[0] === leader);
		if (!found) throw new Error(`kpi: "${leader}" leads no group on this board`);
		return found;
	}

	spec(id: string): KpiSpec {
		const def = this.#defs()[id];
		if (!def) throw new Error(`kpi: "${id}" is not declared on this board`);
		return def.spec;
	}

	/** Where each divider sits along a merged card's axis, as a fraction of it. */
	dividers(leader: string): number[] {
		return dividerFractions(this.group(leader).weights);
	}

	/** Is this KPI a group leader — the id the board renders a card for? */
	leads(id: string): boolean {
		return this.groups.some((g) => g.ids[0] === id);
	}

	merge(a: string, b: string, axis: MergeAxis, spanOf: (id: string) => number): void {
		this.#pref.value = mergeGroups(this.groups, a, b, axis, spanOf);
	}

	/** Split at the divider before section `index`, and the rectangles the two halves take. */
	split(leader: string, index: number, rect: Rect): { ids: [string, string]; rects: [Rect, Rect] } {
		const group = this.group(leader);
		const rects = splitRects(group, rect, index);
		this.#pref.value = splitGroup(this.groups, leader, index);
		return { ids: [leader, group.ids[index]!], rects };
	}

	reset(): void {
		this.#pref.value = [];
	}
}
