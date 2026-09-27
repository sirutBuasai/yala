// Data primitives: the shapes the dashboard can compute, decoupled from how they're drawn. Numbers +
// structure + a `unit`, never colours or chart config.

import { money, moneyCompact, moneyExact, numCompact } from '$lib/utils/format';
import type { Label } from '$lib/ui/label';

// --- units ---

export type Unit =
	| { kind: 'money'; currency: string }
	| { kind: 'percent' }
	| { kind: 'count' }
	| { kind: 'duration'; period: 'month' | 'year' }
	| { kind: 'year' };

export const MONEY = (currency = 'USD'): Unit => ({ kind: 'money', currency });
export const PERCENT: Unit = { kind: 'percent' };
export const COUNT: Unit = { kind: 'count' };
export const MONTHS: Unit = { kind: 'duration', period: 'month' };
export const YEARS: Unit = { kind: 'duration', period: 'year' };
/** A point on the calendar. Distinct from `YEARS`, which is a span of them. */
export const YEAR: Unit = { kind: 'year' };

/** Render a raw value in its unit. Shared so every visual formats the same figure the same way. */
export function formatUnit(value: number, unit: Unit): string {
	switch (unit.kind) {
		case 'money':
			return money(value);
		case 'percent':
			return `${Math.round(value)}%`;
		case 'count':
			return Math.round(value).toLocaleString();
		// Ungrouped: a year with a thousands separator reads as a quantity rather than a date.
		case 'year':
			return String(Math.round(value));
		// A decimal, because a duration is small enough that rounding changes the answer.
		case 'duration':
			return `${value.toFixed(1)} ${unit.period === 'month' ? 'mo' : 'yr'}`;
	}
}

/** For a tooltip, where a reader goes for the exact figure: money keeps its cents. */
export function formatUnitExact(value: number, unit: Unit): string {
	return unit.kind === 'money' ? moneyExact(value) : formatUnit(value, unit);
}

/** For a box too narrow for the whole reading. Only these two units have thousands to give up. */
export function formatUnitCompact(value: number, unit: Unit): string {
	if (unit.kind === 'money') return moneyCompact(value);
	if (unit.kind === 'count') return numCompact(value);

	return formatUnit(value, unit);
}

/** For a figure whose sign is its meaning. The unit formatters only ever show a minus. */
export function formatDelta(value: number, unit: Unit): string {
	return (value > 0 ? '+' : '') + formatUnit(value, unit);
}

/**
 * A magnitude held to `digits` digits, sign kept. A percentage against a near-zero base has no bound and a
 * card does; the figure it stands in for belongs in the tooltip beside it.
 */
export function capped(value: number, digits: number): number {
	const ceiling = 10 ** digits - 1;

	return Math.abs(value) > ceiling ? Math.sign(value) * ceiling : value;
}

/** Digits a capped reading is held to. One ceiling rather than a graded set: nothing marks a reading as
    capped, so an intermediate cap would read as a figure somebody could act on. */
export const CAP_DIGITS = 3;

/** How much of a delta to show: `digits` caps its magnitude, `note` keeps what it is measured against. */
export interface DeltaDetail {
	digits?: number;
	note?: boolean;
}

/** A delta as it reads on a card: the signed figure, then what it is measured against. */
export function deltaLabel(
	delta: NonNullable<Scalar['delta']>,
	{ digits = Infinity, note = true }: DeltaDetail = {}
): string {
	const tail = note && delta.note ? ` ${delta.note}` : '';

	return formatDelta(capped(delta.value, digits), delta.unit) + tail;
}

// --- primitive kinds ---

export type PrimitiveKind =
	| 'scalar'
	| 'categorical'
	| 'series'
	| 'multiseries'
	| 'flow'
	| 'matrix'
	| 'table'
	| 'bullet'
	| 'deviation';

export type Axis = 'time' | 'ordinal';

/** Whether a figure reads as good or bad news. Not its sign; which way is good depends on the measure. */
export type Tone = 'good' | 'bad';

/** A single number in context. `null` means "not applicable" and renders as an em dash. */
export interface Scalar {
	kind: 'scalar';
	unit: Unit;
	/** A `Label`, not a string: titles are renameable, so interpolated text must arrive as the derived half. */
	label: Label;
	value: number | null;
	/** Set only where the sign is the figure's meaning. A plain level is never toned. */
	tone?: Tone;
	/** A change or rate shown beside the value. Its note rides with the badge, so it is never renamed. */
	delta?: { value: number; unit: Unit; tone?: Tone; note?: string };
	/** A level this figure is judged against, in the figure's own unit — what a `meter` mark fills to. */
	target?: number;
	/** What a card captions itself with (already localized). */
	note?: Label;
}

/** Everything a scalar may carry beyond the four fields every one of them has. */
export type ScalarDetail = Omit<Scalar, 'kind' | 'unit' | 'label' | 'value'>;

/** The one way a `Scalar` is built, so no builder can forget a field or spell `kind` itself. */
export function scalar(
	unit: Unit,
	label: Label,
	value: number | null,
	detail: ScalarDetail = {}
): Scalar {
	return { kind: 'scalar', unit, label, value, ...detail };
}

export interface CategoricalPoint {
	key: string;
	value: number;
	/** What this point's colour is looked up by, where that differs from the key it is labelled with. The
	    colour map is keyed by ledger path, so a point labelled by display name needs this. */
	colorKey?: string;
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
	/** The same point read in the series' `altUnit`. */
	alt?: number | null;
}

/** One ordered sequence, layerable with compatible peers. */
export interface Series {
	kind: 'series';
	unit: Unit;
	axis: Axis;
	name: string;
	points: SeriesPoint[];
	/** Each point's period key (ISO, as coarse as the point), where a label alone cannot place it in a
	    period: a snapshot's date says which month it falls in, where its label names only the day. */
	periods?: string[];
	/** A second unit the same points can be read in, reported beside the value wherever a chart states an
	    exact figure — so a pair of readings at two scales costs one chart rather than two. */
	altUnit?: Unit;
	/** A level the whole series is judged against, drawn behind it. Named in the chart's small print. */
	reference?: { value: number; label: string };
}

/** Several compatible series sharing one axis. */
export interface MultiSeries {
	kind: 'multiseries';
	unit: Unit;
	axis: Axis;
	labels: string[];
	/** As on `Series`, for the shared axis. */
	periods?: string[];
	/** What each point's hover adds after its label, where the label alone does not place it. */
	notes?: string[];
	series: Series[];
	/** A range drawn behind the series named `of`, in its colour: where it may land rather than one path. */
	band?: { name: string; of: string; lo: number[]; hi: number[] };
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

/** Which direction of a tinted column reads as good news. */
export type TintDirection = 'up-good' | 'up-bad';

export interface TableColumn {
	label: string;
	/** When set, the column is numeric and formatted in this unit. */
	unit?: Unit;
	/**
	 * Shade this column's cells by magnitude, greenest and reddest at its own largest value. Scaled per
	 * column, so a column of hundreds tints as strongly as one of tens of thousands.
	 */
	tint?: TintDirection;
}

export interface Table {
	kind: 'table';
	columns: TableColumn[];
	rows: (string | number)[][];
	/** Each row's period key, as on `Series`. */
	periods?: string[];
}

/** One value against its threshold. The threshold is the row's full scale, so rows measured in
    different units still read against each other. */
export interface BulletRow {
	label: string;
	unit: Unit;
	value: number | null;
	/** The threshold to compare against, which the row's track runs to. */
	target: number;
	/** Footnote under the row (already localized). */
	note?: Label;
	/** The same reading as the amounts behind it, where the figure is a share of one. */
	amount?: { value: number; target: number; unit: Unit };
}

export interface Bullet {
	kind: 'bullet';
	rows: BulletRow[];
}

/**
 * One row's latest figure against the range it usually falls in: `base` is the typical level, `lo`/`hi`
 * the extremes of the window that typical came from.
 */
export interface DeviationRow {
	label: string;
	value: number;
	base: number;
	lo: number;
	hi: number;
}

/** Rows judged each against its own range, so one row's size can't crush another's. */
export interface Deviation {
	kind: 'deviation';
	unit: Unit;
	rows: DeviationRow[];
}

export type Primitive =
	Scalar | Categorical | Series | MultiSeries | Flow | Matrix | Table | Bullet | Deviation;

/**
 * A figure's readings, fullest first, for a box that shows the fullest it has room for: to the cent, then
 * whole, then abbreviated. `signed` prints a plus on a gain, for a figure whose sign is its meaning. Units
 * with nothing to give up have one reading.
 */
export function readingsOf(value: number, unit: Unit, signed = false): string[] {
	const plus = signed && value > 0 ? '+' : '';
	const all =
		unit.kind === 'money'
			? [formatUnitExact(value, unit), formatUnit(value, unit), formatUnitCompact(value, unit)]
			: unit.kind === 'count'
				? [formatUnit(value, unit), formatUnitCompact(value, unit)]
				: [formatUnit(value, unit)];
	return [...new Set(all)].map((r) => plus + r);
}
