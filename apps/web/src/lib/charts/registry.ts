// The chart registry: each entry declares which primitive kinds a chart accepts and how to adapt a
// primitive into that chart's props. Colour is assigned here, never in the data layer.

import type { Component } from 'svelte';
import type {
	Bullet,
	Categorical,
	Deviation,
	Flow,
	Matrix,
	MultiSeries,
	Primitive,
	PrimitiveKind,
	Series,
	Table
} from '$lib/data/primitives';
import { accountVar, CATEGORY_TOKEN, categoryVar } from '$lib/utils/theme';

import Donut from '$lib/charts/Donut.svelte';
import HBarChart from '$lib/charts/HBarChart.svelte';
import LineChart from '$lib/charts/LineChart.svelte';
import BarChart from '$lib/charts/BarChart.svelte';
import Sankey from '$lib/charts/Sankey.svelte';
import Dumbbell from '$lib/charts/Dumbbell.svelte';
import StackedArea from '$lib/charts/StackedArea.svelte';
import BulletChart from '$lib/charts/BulletChart.svelte';
import Heatmap from './Heatmap.svelte';
import DataTable from './Table.svelte';

/** Extra rendering options for `adapt`. */
interface AdaptOpts {
	/** Draw a gradient area under a single line. */
	area?: boolean;
	/** Fill colour for a single-series chart (columns, line, area). */
	color?: string;
	/** What a categorical chart's keys name, and so where their colours come from. */
	colorBy?: ColorBy;
	/** Total for ranked-bar percentage tooltips. */
	total?: number;
	/** Log-scale a line chart's value axis (series spanning orders of magnitude). */
	log?: boolean;
	/** Label each line at its right edge instead of drawing a legend. */
	endLabels?: boolean;
	/** Fix a line chart's value axis to end here, so a level partway up is not squashed to the floor. */
	ceiling?: number;
	/** Heatmap scaling: per band along the named axis ('row' by default), or one scale for the grid. */
	normalize?: 'row' | 'col' | 'global';
	/** Series names to draw as a dotted line. */
	dashed?: string[];
	/** Print each bar's own figure above it (a lone series only) — see `BarChart`. */
	valueLabels?: boolean;
}

export interface ChartDef<P extends Record<string, unknown> = Record<string, unknown>> {
	id: string;
	label: string;
	accepts: PrimitiveKind[];
	component: Component<P>;
	adapt(primitive: Primitive, opts?: AdaptOpts): P;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PropsOf<C> = C extends Component<infer P, any, any> ? P : never;

/** `adapt` must return exactly the props inferred from `component`, so renaming a chart's prop is a
    compile error here; the type is then erased so the registry can hold heterogeneous charts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function def<C extends Component<any, any, any>>(d: {
	id: string;
	label: string;
	accepts: PrimitiveKind[];
	component: C;
	adapt(primitive: Primitive, opts?: AdaptOpts): PropsOf<C>;
}): ChartDef {
	return d as unknown as ChartDef;
}

// --- colour assignment ---

/** Role token per well-known series, keyed by the label the data layer gives it, so the data stays
    colour-blind. Anything unnamed cycles the fallback palette. */
const SERIES_ROLE: Record<string, string> = {
	// Flows.
	Income: 'var(--role-income)',
	Spent: 'var(--role-spending)',
	Spending: 'var(--role-spending)',
	Saved: 'var(--role-saving)',
	// Saving's hue, not a rate hue: it reads beside `Saved` on the same boards.
	'Savings rate': 'var(--role-saving)',
	'Spending rate': 'var(--role-spending)',
	'Deduction rate': 'var(--role-deduction)',
	// The gross → net chain, one hue per term: no two sides of a subtraction share one.
	Gross: 'var(--role-income)',
	Deductions: 'var(--role-deduction)',
	Contributions: 'var(--role-saving)',
	'Net income': 'var(--role-net)',
	'Take-home': 'var(--role-takehome)',
	// Stocks.
	'Net worth': 'var(--role-balance)',
	Assets: 'var(--role-asset)',
	Liabilities: 'var(--role-liability)',
	// Allocation buckets.
	Liquid: 'var(--role-liquid)',
	Taxable: 'var(--role-taxable)',
	'Tax-advantaged': 'var(--role-taxadv)',
	// Growth decomposition. `Saved` is above, shared with the cash-flow boards: one hue per measure.
	'Market & other': 'var(--role-market)',
	// A rate on the balance rather than the balance itself, so it takes its own hue and not net worth's.
	'Balance growth': 'var(--role-growth)'
};

/** For series with no role and no category. */
const PALETTE = [
	'var(--lav)',
	'var(--teal)',
	'var(--green)',
	'var(--gold)',
	'var(--blue)',
	'var(--magenta)',
	'var(--aqua)',
	'var(--orange)',
	'var(--berry)'
];

/** A series' colour from its name, so one measure carries one hue wherever it is drawn. */
export function seriesColor(name: string, index = 0): string {
	return (
		SERIES_ROLE[name] ??
		(CATEGORY_TOKEN[name] ? categoryVar(name) : null) ??
		PALETTE[index % PALETTE.length]!
	);
}

/** A categorical's keys are just strings, so only the caller knows whether they name spending
    categories, ledger accounts, or roles. */
export type ColorBy = 'category' | 'account' | 'role';

function keyColor(key: string, mode: ColorBy = 'category'): string {
	// Neither the synthetic residual nor the rolled-up tail is a member of the set being coloured, so
	// both outrank every mode.
	if (key === 'Saved') return 'var(--role-saving)';
	if (key === 'Other') return 'var(--ink-3)';
	if (mode === 'account') return accountVar(key);
	if (mode === 'role') return SERIES_ROLE[key] ?? 'var(--ink-3)';
	return categoryVar(key);
}

/** A flow node's role names the term a series would, so its hue comes from `SERIES_ROLE`. */
const FLOW_ROLE_SERIES = {
	gross: 'Gross',
	takehome: 'Take-home',
	deduction: 'Deductions',
	saving: 'Contributions'
} as const;

// --- series collection ---

/** Flatten a series/multiseries into its series list and the labels they share. */
function seriesOf(p: Series | MultiSeries): { labels: string[]; list: Series[] } {
	const list = p.kind === 'series' ? [p] : [...p.series];
	const base = list[0];
	if (!base) return { labels: [], list };
	return { labels: base.points.map((pt) => pt.label), list };
}

/** A lone series may be given an explicit fill; an override can't speak for a set of them. */
function fillOf(list: Series[], s: Series, i: number, opts: AdaptOpts): string {
	return list.length === 1 && opts.color ? opts.color : seriesColor(s.name, i);
}

/** Name, values and colour — what every multi-series chart takes. Nulls become 0, since only a line
    can leave a gap. An alternate reading rides along where the data carries one. */
function toPlainSeries(list: Series[], opts: AdaptOpts) {
	return list.map((s, i) => ({
		name: s.name,
		values: s.points.map((pt) => pt.value ?? 0),
		color: fillOf(list, s, i, opts),
		alt: s.altUnit ? s.points.map((pt) => pt.alt ?? null) : undefined
	}));
}

/** The alternate unit a set of series is read in, when they agree on one. */
function altUnitOf(list: Series[]): Series['altUnit'] {
	const units = list.map((s) => s.altUnit);
	const first = units[0];
	return first && units.every((u) => u?.kind === first.kind) ? first : undefined;
}

/** The above plus the line-only treatments, which keep nulls as gaps. */
function toLineSeries(list: Series[], opts: AdaptOpts) {
	return list.map((s, i) => ({
		name: s.name,
		values: s.points.map((pt) => pt.value),
		color: fillOf(list, s, i, opts),
		// The area belongs to the primary reading, so it fills the first series only.
		area: opts.area && i === 0 ? true : undefined,
		dashed: opts.dashed?.includes(s.name) || undefined
	}));
}

// --- the registry ---

export const CHARTS: ChartDef[] = [
	def({
		id: 'donut',
		label: 'Donut',
		accepts: ['categorical'],
		component: Donut,
		adapt(p, opts = {}) {
			const c = p as Categorical;
			return {
				slices: c.points.map((pt) => ({
					name: pt.key,
					value: pt.value,
					color: keyColor(pt.colorKey ?? pt.key, opts.colorBy)
				})),
				unit: c.unit
			};
		}
	}),
	def({
		id: 'ranked-bars',
		label: 'Ranked bars',
		accepts: ['categorical'],
		component: HBarChart,
		adapt(p, opts = {}) {
			const c = p as Categorical;
			return {
				items: c.points.map((pt) => ({
					label: pt.key,
					value: pt.value,
					color: keyColor(pt.colorKey ?? pt.key, opts.colorBy)
				})),
				unit: c.unit,
				total: opts.total
			};
		}
	}),
	def({
		id: 'bar',
		label: 'Bar',
		accepts: ['series', 'multiseries'],
		component: BarChart,
		adapt(p, opts = {}) {
			const sm = p as Series | MultiSeries;
			const { labels, list } = seriesOf(sm);
			return {
				labels,
				series: toPlainSeries(list, opts),
				unit: sm.unit,
				altUnit: altUnitOf(list),
				valueLabels: opts.valueLabels,
				// A reference belongs to one series, so it only travels when there is only one.
				reference: list.length === 1 ? list[0]!.reference : undefined
			};
		}
	}),
	def({
		id: 'line',
		label: 'Line',
		accepts: ['series', 'multiseries'],
		component: LineChart,
		adapt(p, opts = {}) {
			const sm = p as Series | MultiSeries;
			const { labels, list } = seriesOf(sm);
			return {
				labels,
				series: toLineSeries(list, opts),
				unit: sm.unit,
				log: opts.log,
				endLabels: opts.endLabels,
				ceiling: opts.ceiling
			};
		}
	}),
	def({
		id: 'dumbbell',
		label: 'Range dumbbell',
		accepts: ['deviation'],
		component: Dumbbell,
		adapt(p, opts = {}) {
			const d = p as Deviation;
			return {
				rows: d.rows.map((r) => ({ ...r, color: keyColor(r.label, opts.colorBy) })),
				unit: d.unit
			};
		}
	}),
	def({
		id: 'stacked-area',
		label: 'Stacked area',
		accepts: ['multiseries'],
		component: StackedArea,
		adapt(p, opts = {}) {
			const m = p as MultiSeries;
			return {
				labels: m.labels,
				series: toPlainSeries(m.series, opts),
				unit: m.unit,
				altUnit: altUnitOf(m.series)
			};
		}
	}),
	def({
		id: 'bullet',
		label: 'Bullet',
		accepts: ['bullet'],
		component: BulletChart,
		adapt(p) {
			return { rows: (p as Bullet).rows };
		}
	}),
	def({
		id: 'sankey',
		label: 'Sankey',
		accepts: ['flow'],
		component: Sankey,
		adapt(p) {
			const f = p as Flow;
			return {
				nodes: f.nodes.map((n) => ({
					...n,
					color: n.role === 'category' ? keyColor(n.label) : seriesColor(FLOW_ROLE_SERIES[n.role])
				})),
				links: f.links,
				unit: f.unit
			};
		}
	}),
	def({
		id: 'heatmap',
		label: 'Heatmap',
		accepts: ['matrix'],
		component: Heatmap,
		adapt(p, opts = {}) {
			const m = p as Matrix;
			const normalize = opts.normalize ?? 'row';
			// Band members carry the hue, whichever axis they sit on. `global` has no bands to colour by.
			const band = normalize === 'row' ? m.rows : m.cols;
			return {
				rows: m.rows,
				cols: m.cols,
				values: m.values,
				unit: m.unit,
				normalize,
				colors: normalize === 'global' ? undefined : band.map((key) => keyColor(key, opts.colorBy))
			};
		}
	}),
	def({
		id: 'table',
		label: 'Table',
		accepts: ['table'],
		component: DataTable,
		adapt(p) {
			return { table: p as Table };
		}
	})
];

export const CHARTS_BY_ID: Record<string, ChartDef> = Object.fromEntries(
	CHARTS.map((c) => [c.id, c])
);

/** Charts that can render a given primitive kind. */
export function chartsForKind(kind: PrimitiveKind): ChartDef[] {
	return CHARTS.filter((c) => c.accepts.includes(kind));
}

/** The chart a kind is drawn with unless the board says otherwise: the first that accepts it. */
export function defaultChart(kind: PrimitiveKind): ChartDef | undefined {
	return chartsForKind(kind)[0];
}
