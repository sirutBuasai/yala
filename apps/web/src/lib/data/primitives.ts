// Data primitives — the vocabulary of shapes the dashboard can compute, decoupled from how they're
// drawn. A primitive is numbers + structure + a `unit`, and carries no colours or chart config. The
// `unit` names the measurement scale, which is what lets one formatter render every figure.

import { money } from '$lib/utils/format';

// --- units ---

export type Unit =
	| { kind: 'money'; currency: string }
	| { kind: 'percent' }
	| { kind: 'count' }
	/** A span of time — how long something lasts. */
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
		// Durations keep a decimal: they are small numbers where rounding changes the answer.
		case 'duration':
			return `${value.toFixed(1)} ${unit.period === 'month' ? 'mo' : 'yr'}`;
	}
}

/**
 * The same, for a figure whose SIGN is its meaning — a change, a deviation from an average. The
 * formatters only ever show a minus, so without this a rise and a fall read identically apart from
 * their colour, and colour alone is not a reading.
 */
export function formatDelta(value: number, unit: Unit): string {
	return (value > 0 ? '+' : '') + formatUnit(value, unit);
}

// --- primitive kinds ---

export type PrimitiveKind =
	'scalar' | 'categorical' | 'series' | 'multiseries' | 'flow' | 'matrix' | 'table' | 'bullet';

export type Axis = 'time' | 'ordinal';

/**
 * Whether a figure reads as good or bad news. NOT its sign: spending going up is bad news and
 * spending going down is good, so the sign alone can't pick the colour.
 */
export type Tone = 'good' | 'bad';

/** A single number in context. `null` means "not applicable" and renders as an em dash. */
export interface Scalar {
	kind: 'scalar';
	unit: Unit;
	label: string;
	value: number | null;
	/** Colour for the value. Set only where the SIGN is the figure's meaning — a balance that can go
	    negative, a deviation from an average. A plain level is never toned. */
	tone?: Tone;
	/** A secondary figure — a change or a rate — shown beside the value. */
	delta?: { value: number; unit: Unit; tone?: Tone; note?: string };
	/** Free-text footnote (already localized). */
	note?: string;
}

export interface CategoricalPoint {
	key: string;
	value: number;
}

/** Named parts of a whole. */
export interface Categorical {
	kind: 'categorical';
	unit: Unit;
	points: CategoricalPoint[];
}

export interface SeriesPoint {
	label: string;
	value: number | null;
}

/** One ordered sequence, layerable with compatible peers. */
export interface Series {
	kind: 'series';
	unit: Unit;
	axis: Axis;
	name: string;
	points: SeriesPoint[];
}

/** Several compatible series sharing one axis. */
export interface MultiSeries {
	kind: 'multiseries';
	unit: Unit;
	axis: Axis;
	labels: string[];
	series: Series[];
}

/** What a flow node is, which the visualization layer maps to a colour. */
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

/** A conserved flow between nodes. */
export interface Flow {
	kind: 'flow';
	unit: Unit;
	nodes: FlowNode[];
	links: FlowLink[];
}

/** A rows × cols grid of a single measure. */
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

/** Tabular rows. */
export interface Table {
	kind: 'table';
	columns: TableColumn[];
	rows: (string | number)[][];
}

/**
 * One measured value against the threshold it's being judged by. Each row carries its own unit and
 * is scaled independently, since rows in one bullet set answer the same question in different
 * measures.
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

/** Several value-against-threshold rows. */
export interface Bullet {
	kind: 'bullet';
	rows: BulletRow[];
}

export type Primitive =
	Scalar | Categorical | Series | MultiSeries | Flow | Matrix | Table | Bullet;
