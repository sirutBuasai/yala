// One board's KPI grouping: which cards are merged, and the pane table that follows.
//
// Persisted separately from the arrangement because it is a different decision: which panes the board
// HAS, rather than where they sit.

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

/** A group whose ids or weights are half-read is dropped — a mangled one would render sections
    against the wrong figures. */
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
	/** A getter: a KPI's scope follows the period the view is showing, so the defs are live. */
	readonly #defs: () => KpiBoardDefs;
	readonly #pref: Pref<KpiGroup[]>;

	constructor(key: string, defs: () => KpiBoardDefs) {
		this.#defs = defs;
		this.#pref = new Pref<KpiGroup[]>(`kpi-${key}`, [], storedGroups());
	}

	// `$derived.by` throughout: a field initialiser runs before the constructor body, so reading a
	// private field directly would read it unassigned.
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
	 * The whole pane table: KPI cards first so they lead the priority order, then the view's own. Refuses a
	 * duplicate id, which would shadow one entry and drop that pane silently.
	 *
	 * MUST be called inside a `$derived`: merging changes which panes this returns, and a table computed
	 * once leaves the board reserving rows for a pane nothing renders.
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

	merge(a: string, b: string, axis: MergeAxis, memberSpan: (id: string) => number): void {
		this.#pref.value = mergeGroups(this.groups, a, b, axis, memberSpan);
	}

	/**
	 * Split at the divider before section `index`, and the rectangles the two halves take. `floors` is
	 * what each half's content needs, which only the pane can measure (see `measure.ts`).
	 */
	split(
		leader: string,
		index: number,
		rect: Rect,
		floors: [number, number]
	): { ids: [string, string]; rects: [Rect, Rect] } {
		const group = this.group(leader);
		const rects = splitRects(group, rect, index, floors);
		this.#pref.value = splitGroup(this.groups, leader, index);
		return { ids: [leader, group.ids[index]!], rects };
	}

	reset(): void {
		this.#pref.value = [];
	}
}
