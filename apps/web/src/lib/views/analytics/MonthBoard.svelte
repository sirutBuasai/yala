<script lang="ts">
	// Analytics · Month: one year read month by month. Picking a month's bars scopes the KPIs and the
	// Sankey to it; only the heatmap leaves the page, for the rows behind a cell.
	import { drillTo } from '$lib/nav/drill';
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';
	import { cashFlowChain, cashFlowChanges, columnHeading } from '$lib/data/catalog';
	import { statCells } from '$lib/charts/statMatrix';
	import { live, words } from '$lib/ui/label';
	import { monthLabel, MONTHS } from '$lib/utils/format';
	import { monthKey as monthKeyOf, monthOf, yearOf } from '$lib/utils/period';
	import { MONTH_PARAM } from '$lib/nav/focus';
	import { incomeChain, INCOME_CHAIN_MERGES } from './kpis';

	interface Props {
		data: DashboardData;
		monthKey: string;
		/** Whether the board reads at the focus month rather than its year. */
		scoped: boolean;
		/** Picks a month of the focus year, by key. */
		onpick: (monthKey: string) => void;
	}
	let { data, monthKey, scoped, onpick }: Props = $props();

	const year = $derived(yearOf(monthKey));
	const yr = $derived<Scope>({ level: 'year', year });
	const scope = $derived<Scope>(scoped ? { level: 'month', monthKey } : yr);
	const pickedMonth = $derived(scoped ? MONTHS[monthOf(monthKey) - 1] : undefined);

	const KPIS = $derived(incomeChain(scope, 'columns'));
	const kpis = useKpiBoard('analytics:month', () => KPIS, INCOME_CHAIN_MERGES.columns);

	const PANES = $derived(
		kpis.board({
			// `scale` so the matrix is given room or taken down to where its rows would clip, like a KPI card.
			cashflow: { x: 16, y: 0, w: 32, h: 9, content: 'scale' },
			trend: {
				x: 16,
				y: 9,
				w: 32,
				h: 10,
				content: 'scale',
				figure: {
					figure: 'overview.cash_flow_bars',
					scope: yr,
					chart: 'bar',
					title: words('Net income vs take-home vs spending vs saved'),
					caption: { context: String(year), text: 'per month' }
				}
			},
			// Categories arrive biggest-first, so the ranking is implicit left to right. Scaled per column,
			// since it is the categories that span orders of magnitude.
			heatmap: {
				x: 0,
				y: 19,
				w: 48,
				h: 18,
				content: 'scale',
				figure: {
					figure: 'spending.category_by_month',
					scope: yr,
					chart: 'heatmap',
					normalize: 'col',
					mark: pickedMonth,
					title: words('Category by month'),
					caption: words('category spending split per month')
				}
			},
			flow: {
				x: 0,
				y: 37,
				w: 48,
				h: 24,
				content: 'scale',
				figure: {
					figure: 'money.flow',
					scope,
					chart: 'sankey',
					title: words('Where it all went'),
					caption: {
						context: scoped ? monthLabel(monthKey) : String(year),
						text: 'gross income to each spending category'
					}
				}
			}
		})
	);

	// Run-rates compare against last year's run-rate, so a part-finished year doesn't read as a collapse.
	const CHAIN = cashFlowChain(['income', 'spending', 'saved']);
	const columns = CHAIN.map(columnHeading);

	// The run-rate row carries no caption: every column divides by the same active months, so the matrix
	// hoists that divisor under the label itself.
	const cashflow = $derived([
		{
			label: live(`Total ${year}`),
			caption: words('across the year, against last'),
			cells: statCells(cashFlowChanges(CHAIN), yr)
		},
		{
			label: words('Avg / month'),
			cells: statCells(
				CHAIN.map((c) => c.perMonth),
				yr
			)
		}
	]);

	const keyOf = (month: string) => monthKeyOf(year, MONTHS.indexOf(month) + 1);

	/** A month label opens that month's rows in the history; a cell opens them filtered to its category. */
	function openRows(month: string, category: string | null) {
		const query = new URLSearchParams({ [MONTH_PARAM]: keyOf(month) });
		if (category) query.set('category', category);
		void drillTo(`/transactions?${query}`, { pane: 'history' });
	}
</script>

<Board key="analytics:month" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane
		id="cashflow"
		title={{ context: String(year), text: 'cash flow' }}
		caption={words('comparison against previous year and run-rate')}
	>
		<StatMatrix {data} {columns} rows={cashflow} />
	</Pane>

	<FigurePane
		id="trend"
		{data}
		spec={PANES.trend.figure}
		picked={pickedMonth}
		onpick={(month) => onpick(keyOf(month))}
	/>
	<FigurePane id="heatmap" {data} spec={PANES.heatmap.figure} onpick={openRows} />
	<FigurePane id="flow" {data} spec={PANES.flow.figure} />
</Board>
