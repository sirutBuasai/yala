// What a KPI is, declared as data. A view names the figure, the scope, the badge and the chart; it
// never writes the markup, so swapping a stat is a change of identifier.

import type { Rect } from '$lib/layout/grid/types';
import type { Scope } from '$lib/data/scope';
import type { Label } from '$lib/ui/label';
import type { MergeAxis } from './merge';

/** The marks a KPI may carry. A ring sits inline before the number, a meter under it; the rest sit
    behind it. */
export type KpiChart = 'bar' | 'line' | 'area' | 'ring' | 'meter';

export interface KpiSpec {
	/** Catalog id of the scalar this KPI shows. Its label, note and delta come from there. */
	figure: string;
	scope: Scope;
	/** Title override. The scalar titles itself otherwise. */
	title?: Label;
	/** Caption override. The scalar's own note otherwise. */
	caption?: Label;
	/** `ring` reads the scalar's percentage and `meter` its `target`; every other shape needs a `series` id. */
	chart?: KpiChart;
	/** Catalog id of the series a bar / line / area chart draws. */
	series?: string;
	/** Scale the chart to the series' own range; see `Spark`. */
	level?: boolean;
	/** The page the title opens, by its path. A card with none has no link. */
	open?: string;
}

/** One KPI as a view declares it: the spec, plus where it sits when it is its own card. */
export interface KpiDef {
	rect: Rect;
	spec: KpiSpec;
}

/** A board's KPIs in declaration order — also the order merging offers them in. */
export type KpiBoardDefs = Record<string, KpiDef>;

/** Cards a board opens merged into one, in section order. Section spans come from the rects above, so
    the declared rectangles stay the single statement of size. */
export interface KpiMerge {
	ids: string[];
	axis: MergeAxis;
	/** How the card divides between its sections, where that is not their rectangles' spans: a card whose
	    span the sections' whole units cannot split evenly. */
	weights?: number[];
}
