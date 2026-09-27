// The income chain both Analytics boards open with, read at whatever the board is scoped to.

import type { Scope } from '$lib/data/scope';
import type { KpiBoardDefs, KpiMerge, KpiSpec } from '$lib/kpi/spec';
import { words } from '$lib/ui/label';

/** Every amount draws an area, so narrowing to a month keeps the chart's shape. */
export function incomeChain(scope: Scope, layout: 'columns' | 'strip'): KpiBoardDefs {
	const month = scope.level === 'month';
	const amount = (field: string): KpiSpec =>
		month
			? { figure: `vsavg.${field}`, scope, chart: 'area', series: `trend.${field}` }
			: { figure: `income.${field}`, scope, chart: 'area', series: `running.${field}` };
	const rate = (figure: string): KpiSpec => ({ figure, scope, chart: 'ring' });
	// Names the thing that arrives rather than the measure; a month's caption names its average.
	const takehome = month
		? amount('takehome')
		: { ...amount('takehome'), caption: words('direct deposit') };
	const specs: Record<string, KpiSpec> = {
		gross: amount('gross'),
		deductions: amount('deductions'),
		contributions: amount('contributions'),
		takehome,
		net: amount('net'),
		deductionRate: rate('ratio.deduction_rate'),
		spendingRate: rate('ratio.spending_rate'),
		savingsRate: rate('ratio.savings_rate')
	};
	const rects = layout === 'columns' ? COLUMNS : STRIP;
	return Object.fromEntries(
		Object.entries(rects).map(([id, rect]) => [id, { rect, spec: specs[id]! }])
	);
}

// Heights sum to the column's span; the merges below still share the card out evenly.
const COLUMNS = {
	gross: { x: 0, y: 0, w: 8, h: 5 },
	deductions: { x: 0, y: 5, w: 8, h: 5 },
	contributions: { x: 0, y: 10, w: 8, h: 5 },
	takehome: { x: 0, y: 15, w: 8, h: 4 },
	net: { x: 8, y: 0, w: 8, h: 5 },
	deductionRate: { x: 8, y: 5, w: 8, h: 5 },
	spendingRate: { x: 8, y: 10, w: 8, h: 5 },
	savingsRate: { x: 8, y: 15, w: 8, h: 4 }
};

const STRIP = {
	gross: { x: 0, y: 0, w: 8, h: 5 },
	deductions: { x: 8, y: 0, w: 8, h: 5 },
	contributions: { x: 16, y: 0, w: 8, h: 5 },
	net: { x: 24, y: 0, w: 8, h: 5 },
	takehome: { x: 32, y: 0, w: 8, h: 5 },
	deductionRate: { x: 40, y: 0, w: 8, h: 5 },
	spendingRate: { x: 40, y: 5, w: 8, h: 5 },
	savingsRate: { x: 40, y: 10, w: 8, h: 6 }
};

export const INCOME_CHAIN_MERGES: Record<'columns' | 'strip', KpiMerge[]> = {
	columns: [
		{
			ids: ['gross', 'deductions', 'contributions', 'takehome'],
			axis: 'column',
			weights: [5, 5, 5, 5]
		},
		{
			ids: ['net', 'deductionRate', 'spendingRate', 'savingsRate'],
			axis: 'column',
			weights: [5, 5, 5, 5]
		}
	],
	strip: [
		{ ids: ['gross', 'deductions', 'contributions', 'net', 'takehome'], axis: 'row' },
		{ ids: ['deductionRate', 'spendingRate', 'savingsRate'], axis: 'column', weights: [5, 5, 5] }
	]
};
