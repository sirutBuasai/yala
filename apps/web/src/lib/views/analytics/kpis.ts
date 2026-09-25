// The income chain both Analytics boards open with, read at whatever the board is scoped to.

import type { Scope } from '$lib/data/scope';
import type { KpiBoardDefs, KpiMerge, KpiSpec } from '$lib/kpi/spec';
import { words } from '$lib/ui/label';

/**
 * Two columns, each read top to bottom: the income chain, then net income and the rates it is the base
 * of. A month reads against its own average, with its trailing twelve behind it; a year or the lifetime
 * carries its running total and no badge, since a partial year would read as a collapse.
 */
export function incomeChain(scope: Scope): KpiBoardDefs {
	const month = scope.level === 'month';
	const amount = (field: string): KpiSpec =>
		month
			? { figure: `vsavg.${field}`, scope, chart: 'bar', series: `trend.${field}` }
			: { figure: `income.${field}`, scope, chart: 'area', series: `running.${field}` };
	const rate = (figure: string): KpiSpec => ({ figure, scope, chart: 'ring' });
	return {
		gross: { rect: { x: 0, y: 0, w: 8, h: 5 }, spec: amount('gross') },
		deductions: { rect: { x: 0, y: 5, w: 8, h: 5 }, spec: amount('deductions') },
		contributions: { rect: { x: 0, y: 10, w: 8, h: 5 }, spec: amount('contributions') },
		takehome: {
			rect: { x: 0, y: 15, w: 8, h: 5 },
			// Names the thing that arrives rather than the measure; a month's caption names its average.
			spec: month ? amount('takehome') : { ...amount('takehome'), caption: words('direct deposit') }
		},
		net: { rect: { x: 8, y: 0, w: 8, h: 5 }, spec: amount('net') },
		deductionRate: { rect: { x: 8, y: 5, w: 8, h: 5 }, spec: rate('ratio.deduction_rate') },
		spendingRate: { rect: { x: 8, y: 10, w: 8, h: 5 }, spec: rate('ratio.spending_rate') },
		savingsRate: { rect: { x: 8, y: 15, w: 8, h: 5 }, spec: rate('ratio.savings_rate') }
	};
}

export const INCOME_CHAIN_MERGES: KpiMerge[] = [
	{ ids: ['gross', 'deductions', 'contributions', 'takehome'], axis: 'column' },
	{ ids: ['net', 'deductionRate', 'spendingRate', 'savingsRate'], axis: 'column' }
];
