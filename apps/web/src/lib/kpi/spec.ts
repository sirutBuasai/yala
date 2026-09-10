// What a KPI IS, declared as data. A view names the figure, the scope, the badge and the chart; it
// never writes the markup, so swapping a stat is a change of identifier.

import type { Rect } from '$lib/layout/grid/types';
import type { Scope } from '$lib/data/scope';

/** The marks a KPI may carry. A ring sits inline before the number; the rest sit behind it. */
export type KpiChart = 'bar' | 'line' | 'area' | 'ring';

export interface KpiSpec {
	/** Catalog id of the scalar this KPI shows. Its label, note and delta come from there. */
	figure: string;
	scope: Scope;
	/** Title override. The scalar titles itself otherwise. */
	title?: string;
	/** Caption override. The scalar's own note otherwise. */
	caption?: string;
	/**
	 * The chart under (or before) the stat. `ring` reads the scalar's own percentage; every other
	 * shape needs `series` — a catalog series id at the same scope.
	 */
	chart?: KpiChart;
	/** Catalog id of the series a bar / line / area chart draws. */
	series?: string;
}

/** One KPI as a view declares it: the spec, plus where it sits when it is its own card. */
export interface KpiDef {
	rect: Rect;
	spec: KpiSpec;
}

/** A board's KPIs in declaration order — also the order merging offers them in. */
export type KpiBoardDefs = Record<string, KpiDef>;
