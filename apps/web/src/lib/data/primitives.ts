// Data primitives — the vocabulary of shapes the dashboard can compute, decoupled from how they're
// drawn. A primitive is pure numbers + structure + a `unit`; it carries NO colors or chart config
// (those belong to the visualization layer). The `unit` names the measurement scale, which is what
// lets one formatter render every figure the same way.

import { money } from '$lib/utils/format';

// --- units ---

export type Unit =
	| { kind: 'money'; currency: string }
	| { kind: 'percent' }
	| { kind: 'count' }
	/** A span of time — how long something lasts, e.g. months of runway, years of freedom. */
	| { kind: 'duration'; period: 'month' | 'year' };

export const MONEY = (currency = 'USD'): Unit => ({ kind: 'money', currency });
export const PERCENT: Unit = { kind: 'percent' };
export const COUNT: Unit = { kind: 'count' };
export const MONTHS: Unit = { kind: 'duration', period: 'month' };
export const YEARS: Unit = { kind: 'duration', period: 'year' };

/** Render a raw value in its unit. Formatting lives here so every visual agrees. */
export function formatUnit(value: number, unit: Unit): string {
	switch (unit.kind) {
		case 'money':
			return money(value);
		case 'percent':
			return `${Math.round(value)}%`;
		case 'count':
			return Math.round(value).toLocaleString();
		// One decimal: a runway of "14.6 mo" is a materially different answer from "15 mo", and
		// these are always small numbers where the fraction reads clearly.
		case 'duration':
			return `${value.toFixed(1)} ${unit.period === 'month' ? 'mo' : 'yr'}`;
	}
}

// --- primitive kinds ---

export type PrimitiveKind =
	'scalar' | 'categorical' | 'series' | 'multiseries' | 'flow' | 'matrix' | 'table' | 'bullet';

/** Ordered axis a series is plotted against. */
export type Axis = 'time' | 'ordinal';

/** A single number in context — powers KPI / stat tiles. `null` means "not
 *  applicable" (e.g. a ratio with no denominator) and renders as an em dash. */
export interface Scalar {
	kind: 'scalar';
	unit: Unit;
	label: string;
	value: number | null;
	/** Colour hint for the main value when there's no delta. */
	dir?: 'up' | 'down';
	/** A secondary figure (a rate or change) shown under the value. */
	delta?: { value: number; unit: Unit; dir?: 'up' | 'down'; note?: string };
	/** Free-text footnote (already localized). */
	note?: string;
}

export interface CategoricalPoint {
	key: string;
	value: number;
}

/** Named parts of a whole — powers pie / donut / ranked bars. */
export interface Categorical {
	kind: 'categorical';
	unit: Unit;
	points: CategoricalPoint[];
}

export interface SeriesPoint {
	label: string;
	value: number | null;
}

/** One ordered sequence — powers lines / columns. Layerable with compatible peers. */
export interface Series {
	kind: 'series';
	unit: Unit;
	axis: Axis;
	name: string;
	points: SeriesPoint[];
}

/** Several compatible series sharing one axis — powers multi-line / grouped bars. */
export interface MultiSeries {
	kind: 'multiseries';
	unit: Unit;
	axis: Axis;
	labels: string[];
	series: Series[];
}

/** Role drives the visualization layer's node colouring without baking colour into data. */
export type FlowRole = 'gross' | 'takehome' | 'deduction' | 'saving' | 'category';

export interface FlowNode {
	id: string;
	label: string;
	value: number;
	/** Column index (0 = leftmost). */
	col: number;
	role: FlowRole;
}

export interface FlowLink {
	source: string;
	target: string;
	value: number;
}

/** A conserved flow between nodes — powers Sankey diagrams. */
export interface Flow {
	kind: 'flow';
	unit: Unit;
	nodes: FlowNode[];
	links: FlowLink[];
}

/** A rows × cols grid of a single measure — powers heatmaps. */
export interface Matrix {
	kind: 'matrix';
	unit: Unit;
	rows: string[];
	cols: string[];
	/** values[rowIndex][colIndex]. */
	values: number[][];
}

export interface TableColumn {
	label: string;
	/** When set, the column is numeric and formatted in this unit. */
	unit?: Unit;
}

/** Tabular rows — powers data tables. */
export interface Table {
	kind: 'table';
	columns: TableColumn[];
	rows: (string | number)[][];
}

/**
 * One measured value against the threshold it's being judged by.
 *
 * Each row carries its own unit and is scaled independently, because the rows in one bullet set
 * usually answer the same *question* ("how close am I?") in different measures — months of runway
 * beside a percentage of a target. Bands are optional qualitative cut-points along the row's own
 * scale (ascending), for shading "lean / adequate / comfortable" behind the bar.
 */
export interface BulletRow {
	label: string;
	unit: Unit;
	value: number | null;
	/** The threshold to compare against; drawn as a marker, and reached at 100%. */
	target: number;
	/** Ascending cut-points along the scale, shaded from weakest to strongest. */
	bands?: number[];
	/** Free-text footnote (already localized). */
	note?: string;
}

/** Several value-against-threshold rows — powers bullet graphs. */
export interface Bullet {
	kind: 'bullet';
	rows: BulletRow[];
}

export type Primitive =
	Scalar | Categorical | Series | MultiSeries | Flow | Matrix | Table | Bullet;
