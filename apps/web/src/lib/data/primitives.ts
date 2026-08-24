// Data primitives — the vocabulary of shapes the dashboard can compute, decoupled
// from how they're drawn. A primitive is pure numbers + structure + a `unit`; it
// carries NO colors or chart config (those belong to the visualization layer).
//
// The `unit` is what makes two primitives *compatible*: they can be shown side by
// side on one chart only when their units match (money↔money same currency, etc.).
// Series additionally must share an axis and identical label sequence to overlay.

import { money } from '$lib/utils/format';

// --- units ---

export type Unit = { kind: 'money'; currency: string } | { kind: 'percent' } | { kind: 'count' };

export const MONEY = (currency = 'USD'): Unit => ({ kind: 'money', currency });
export const PERCENT: Unit = { kind: 'percent' };
export const COUNT: Unit = { kind: 'count' };

/** Same measurement scale — the core compatibility test. */
export function sameUnit(a: Unit, b: Unit): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'money' && b.kind === 'money') return a.currency === b.currency;
	return true;
}

/** Render a raw value in its unit. Formatting lives here so every visual agrees. */
export function formatUnit(value: number, unit: Unit): string {
	switch (unit.kind) {
		case 'money':
			return money(value);
		case 'percent':
			return `${Math.round(value)}%`;
		case 'count':
			return Math.round(value).toLocaleString();
	}
}

// --- primitive kinds ---

export type PrimitiveKind =
	'scalar' | 'categorical' | 'series' | 'multiseries' | 'flow' | 'matrix' | 'table';

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

export type Primitive = Scalar | Categorical | Series | MultiSeries | Flow | Matrix | Table;

// --- introspection helpers ---

/** The unit of any primitive, or null for the unitless Table. */
export function unitOf(p: Primitive): Unit | null {
	return p.kind === 'table' ? null : p.unit;
}

export function isSeriesLike(p: Primitive): p is Series | MultiSeries {
	return p.kind === 'series' || p.kind === 'multiseries';
}

function axisOf(p: Series | MultiSeries): Axis {
	return p.axis;
}

function labelsOf(p: Series | MultiSeries): string[] {
	return p.kind === 'series' ? p.points.map((pt) => pt.label) : p.labels;
}

function sameLabels(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((l, i) => l === b[i]);
}

// --- compatibility + layering (the "show side by side" contract) ---

/**
 * Whether `b` can be drawn on the same chart as `a`. Requires matching units;
 * for series it also requires the same axis and identical labels so points line up.
 * Different kinds are never compatible (a categorical can't overlay a series).
 */
export function compatible(a: Primitive, b: Primitive): boolean {
	const ua = unitOf(a);
	const ub = unitOf(b);
	if (!ua || !ub || !sameUnit(ua, ub)) return false;

	if (isSeriesLike(a) && isSeriesLike(b)) {
		return axisOf(a) === axisOf(b) && sameLabels(labelsOf(a), labelsOf(b));
	}

	return a.kind === b.kind;
}
