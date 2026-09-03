// The chart registry — the visualization layer's half of the data/visual split.
//
// Each entry declares which primitive KINDS a chart accepts, whether more compatible
// series can be layered onto it, and how to ADAPT a primitive into that chart's props.
// Colour assignment lives here (never in the data layer), so it's defined once instead
// of being rebuilt inline by every view.

import type { Component } from 'svelte';
import type {
	Bullet,
	Categorical,
	Flow,
	Matrix,
	MultiSeries,
	Primitive,
	PrimitiveKind,
	Scalar,
	Series,
	Table
} from '$lib/data/primitives';
import { compatible } from '$lib/data/primitives';
import { accountVar, CATEGORY_TOKEN, categoryVar } from '$lib/utils/theme';

import Donut from '$lib/charts/Donut.svelte';
import HBarChart from '$lib/charts/HBarChart.svelte';
import LineChart from '$lib/charts/LineChart.svelte';
import BarChart from '$lib/charts/BarChart.svelte';
import Sankey from '$lib/charts/Sankey.svelte';
import DivergingBars from '$lib/charts/DivergingBars.svelte';
import StackedArea from '$lib/charts/StackedArea.svelte';
import BulletChart from '$lib/charts/BulletChart.svelte';
import Heatmap from './Heatmap.svelte';
import DataTable from './Table.svelte';
import StatTile from './StatTile.svelte';

/** Extra rendering options a caller can pass to `adapt` (all optional). */
interface AdaptOpts {
	/** Additional series to layer onto a series/line chart (filtered to compatible). */
	layers?: Series[];
	/** Draw a gradient area under a single line. */
	area?: boolean;
	/** Force the legend on/off. */
	legend?: boolean;
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
	/** Heatmap scaling: per row (default) or one scale for the whole grid. */
	normalize?: 'row' | 'global';
	/** Series names to draw as a dotted line — a secondary reading against a primary one. */
	dashed?: string[];
}

export interface ChartDef<P extends Record<string, unknown> = Record<string, unknown>> {
	id: string;
	label: string;
	accepts: PrimitiveKind[];
	/** Whether additional compatible series can be layered on. */
	layerable: boolean;
	component: Component<P>;
	adapt(primitive: Primitive, opts?: AdaptOpts): P;
}

/** The props a Svelte component accepts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PropsOf<C> = C extends Component<infer P, any, any> ? P : never;

/**
 * Register one chart. The props type is inferred from the `component`, and `adapt` is required
 * to return exactly those props — so renaming a chart's prop is caught here at compile time —
 * then the type is erased so the registry array can hold heterogeneous charts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function def<C extends Component<any, any, any>>(d: {
	id: string;
	label: string;
	accepts: PrimitiveKind[];
	layerable: boolean;
	component: C;
	adapt(primitive: Primitive, opts?: AdaptOpts): PropsOf<C>;
}): ChartDef {
	return d as unknown as ChartDef;
}

// --- colour assignment (visualization concern) ---

/**
 * What a well-known series MEANS, mapped to the `--role-*` token for that meaning. Keyed by the
 * label the data layer already gives the series, so the data stays colour-blind and a series
 * carries one hue everywhere it appears — spending is salmon on the monthly bars and on the
 * yearly ones, liabilities are salmon (a negative on net worth) rather than an arbitrary
 * palette slot. Anything unnamed cycles the fallback palette.
 */
const SERIES_ROLE: Record<string, string> = {
	// Flows — what moved this period.
	Income: 'var(--role-income)',
	Spent: 'var(--role-spending)',
	Spending: 'var(--role-spending)',
	Saved: 'var(--role-saving)',
	'Cumulative saved': 'var(--role-saving)',
	'Savings rate': 'var(--role-rate)',
	// Stocks — what you stand on.
	'Net worth': 'var(--role-balance)',
	Assets: 'var(--role-asset)',
	Liabilities: 'var(--role-liability)',
	// Allocation buckets — three slices of assets.
	Liquid: 'var(--role-liquid)',
	Taxable: 'var(--role-taxable)',
	'Tax-advantaged': 'var(--role-taxadv)',
	// The growth decomposition: what you put aside, and everything else that moved the balance.
	'You saved': 'var(--role-saving)',
	'Market & other': 'var(--role-market)'
};

/** For series with no role and no category — kept clear of the role hues where possible. */
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

function seriesColor(name: string, index: number): string {
	// A series named after a spending category takes that category's accent, so the same
	// category reads the same colour across the donut, the ranked bars and the category lines.
	return (
		SERIES_ROLE[name] ??
		(CATEGORY_TOKEN[name] ? categoryVar(name) : null) ??
		PALETTE[index % PALETTE.length]!
	);
}

/**
 * How a categorical chart's keys take their colour. The keys of a categorical are just strings;
 * only the caller knows whether they name spending categories, ledger accounts, or roles, so the
 * chart is told rather than left to guess — which is what previously left every bar in "where the
 * money sits" the same fallback lavender.
 */
export type ColorBy = 'category' | 'account' | 'role';

function keyColor(key: string, mode: ColorBy = 'category'): string {
	// Two reserved keys outrank every mode: `Saved` is the synthetic residual slice and `Other` is
	// the rolled-up tail, and neither is a member of the set being coloured.
	if (key === 'Saved') return 'var(--role-saving)';
	if (key === 'Other') return 'var(--ink-3)';
	if (mode === 'account') return accountVar(key);
	if (mode === 'role') return SERIES_ROLE[key] ?? 'var(--ink-3)';
	return categoryVar(key);
}

const FLOW_ROLE_COLOR = {
	gross: 'var(--role-income)',
	takehome: 'var(--role-income)',
	deduction: 'var(--role-deduction)',
	saving: 'var(--role-saving)'
} as const;

// --- series collection + layering ---

/** Flatten a series/multiseries into its series list, appending compatible layers. */
function seriesOf(
	p: Series | MultiSeries,
	layers: Series[] = []
): { labels: string[]; list: Series[] } {
	const list = p.kind === 'series' ? [p] : [...p.series];
	const base = list[0];
	if (!base) return { labels: [], list };
	const labels = base.points.map((pt) => pt.label);
	// Dynamic layering: any number of compatible series can be added.
	for (const l of layers) if (compatible(base, l)) list.push(l);
	return { labels, list };
}

function toChartSeries(list: Series[], opts: AdaptOpts) {
	return list.map((s, i) => ({
		name: s.name,
		values: s.points.map((pt) => pt.value),
		// A lone series may be given an explicit fill; anything plotted alongside others takes its
		// role colour, since an override would then only be able to speak for one of them.
		color: list.length === 1 && opts.color ? opts.color : seriesColor(s.name, i),
		// The area belongs to the primary reading, so it fills the first series whether or not
		// others are plotted alongside it.
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
		layerable: false,
		component: Donut,
		adapt(p, opts = {}) {
			const c = p as Categorical;
			return {
				slices: c.points.map((pt) => ({
					name: pt.key,
					value: pt.value,
					color: keyColor(pt.key, opts.colorBy)
				}))
			};
		}
	}),
	def({
		id: 'ranked-bars',
		label: 'Ranked bars',
		accepts: ['categorical'],
		layerable: false,
		component: HBarChart,
		adapt(p, opts = {}) {
			const c = p as Categorical;
			return {
				items: c.points.map((pt) => ({
					label: pt.key,
					value: pt.value,
					color: keyColor(pt.key, opts.colorBy)
				})),
				total: opts.total
			};
		}
	}),
	def({
		id: 'bar',
		label: 'Bar',
		accepts: ['series', 'multiseries'],
		layerable: true,
		component: BarChart,
		adapt(p, opts = {}) {
			const { labels, list } = seriesOf(p as Series | MultiSeries, opts.layers);
			return {
				labels,
				series: list.map((s, i) => ({
					name: s.name,
					values: s.points.map((pt) => pt.value ?? 0),
					// A single series may take an explicit fill; multiple use the series palette.
					color: list.length === 1 && opts.color ? opts.color : seriesColor(s.name, i)
				})),
				legend: opts.legend
			};
		}
	}),
	def({
		id: 'line',
		label: 'Line',
		accepts: ['series', 'multiseries'],
		layerable: true,
		component: LineChart,
		adapt(p, opts = {}) {
			const { labels, list } = seriesOf(p as Series | MultiSeries, opts.layers);
			const percent = (p as Series | MultiSeries).unit.kind === 'percent';
			return {
				labels,
				series: toChartSeries(list, opts),
				percent,
				log: opts.log,
				endLabels: opts.endLabels,
				// End labels replace the legend; showing both would say the same thing twice.
				legend: opts.legend ?? (!opts.endLabels && list.length > 1)
			};
		}
	}),
	def({
		id: 'diverging-bars',
		label: 'Diverging bars',
		accepts: ['categorical'],
		layerable: false,
		component: DivergingBars,
		adapt(p) {
			const c = p as Categorical;
			return { items: c.points.map((pt) => ({ label: pt.key, value: pt.value })) };
		}
	}),
	def({
		id: 'stacked-area',
		label: 'Stacked area',
		accepts: ['multiseries'],
		layerable: false,
		component: StackedArea,
		adapt(p, opts = {}) {
			const m = p as MultiSeries;
			return {
				labels: m.labels,
				series: m.series.map((s, i) => ({
					name: s.name,
					values: s.points.map((pt) => pt.value ?? 0),
					color: seriesColor(s.name, i)
				})),
				unit: m.unit,
				legend: opts.legend
			};
		}
	}),
	def({
		id: 'bullet',
		label: 'Bullet',
		accepts: ['bullet'],
		layerable: false,
		component: BulletChart,
		adapt(p) {
			return { rows: (p as Bullet).rows };
		}
	}),
	def({
		id: 'sankey',
		label: 'Sankey',
		accepts: ['flow'],
		layerable: false,
		component: Sankey,
		adapt(p) {
			const f = p as Flow;
			return {
				nodes: f.nodes.map((n) => ({
					...n,
					color: n.role === 'category' ? keyColor(n.label) : FLOW_ROLE_COLOR[n.role]
				})),
				links: f.links
			};
		}
	}),
	def({
		id: 'heatmap',
		label: 'Heatmap',
		accepts: ['matrix'],
		layerable: false,
		component: Heatmap,
		adapt(p, opts = {}) {
			const m = p as Matrix;
			return { rows: m.rows, cols: m.cols, values: m.values, normalize: opts.normalize };
		}
	}),
	def({
		id: 'table',
		label: 'Table',
		accepts: ['table'],
		layerable: false,
		component: DataTable,
		adapt(p) {
			return { table: p as Table };
		}
	}),
	def({
		id: 'stat',
		label: 'Stat tile',
		accepts: ['scalar'],
		layerable: false,
		component: StatTile,
		adapt(p) {
			return { scalar: p as Scalar };
		}
	})
];

export const CHARTS_BY_ID: Record<string, ChartDef> = Object.fromEntries(
	CHARTS.map((c) => [c.id, c])
);

/** Charts that can render a given primitive kind — powers "pick a chart for this data". */
export function chartsForKind(kind: PrimitiveKind): ChartDef[] {
	return CHARTS.filter((c) => c.accepts.includes(kind));
}

/** The default (first) chart for a primitive kind, or undefined if none. */
export function defaultChart(kind: PrimitiveKind): ChartDef | undefined {
	return chartsForKind(kind)[0];
}
