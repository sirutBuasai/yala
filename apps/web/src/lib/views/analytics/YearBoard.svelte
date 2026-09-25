<script lang="ts">
	// Analytics · Year: the whole record read year by year. Picking a year's bars scopes the KPIs and the
	// Sankey to it and marks it on every chart with a year axis.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';
	import { CASH_FLOW_COLUMNS, columnHeading } from '$lib/data/catalog';
	import { statCells } from '$lib/charts/statMatrix';
	import { live, words } from '$lib/ui/label';
	import { yearOf } from '$lib/utils/period';
	import { incomeChain, INCOME_CHAIN_MERGES } from './kpis';

	interface Props {
		data: DashboardData;
		monthKey: string;
		/** Whether the board reads at the focus year rather than its window. */
		scoped: boolean;
		/** The window's first year; absent, the board reads the lifetime. */
		since?: number;
		/** The years the window covers, as the header words them. */
		spanText: string;
		/** Picks a tracked year, by its label. */
		onpick: (year: string) => void;
	}
	let { data, monthKey, scoped, since, spanText, onpick }: Props = $props();

	const all = $derived<Scope>({ level: 'all', since });
	const lifetime = $derived(since == null);
	const year = $derived(yearOf(monthKey));
	const scope = $derived<Scope>(scoped ? { level: 'year', year } : all);
	const pickedYear = $derived(scoped ? String(year) : undefined);

	const KPIS = $derived(incomeChain(scope));
	const kpis = useKpiBoard('analytics:year', () => KPIS, INCOME_CHAIN_MERGES);

	const PANES = $derived(
		kpis.board({
			levels: {
				x: 16,
				y: 0,
				w: 32,
				h: 10,
				content: 'scale',
				figure: {
					figure: 'overview.cash_flow_bars',
					scope: all,
					chart: 'bar',
					title: words('Net income vs take-home vs spending vs saved'),
					caption: words('per year')
				}
			},
			// Rate beside levels: how efficient, versus how big, which the bars alone can't say.
			rate: {
				x: 16,
				y: 10,
				w: 32,
				h: 10,
				content: 'scale',
				figure: {
					figure: 'overview.savings_rate',
					scope: all,
					chart: 'bar',
					title: words('Savings rate by year'),
					caption: words('of net income')
				}
			},
			// `scale` so the matrix is given room or taken down to where its rows would clip, like a KPI card.
			cashflow: { x: 0, y: 20, w: 48, h: 11, content: 'scale' },
			heatmap: {
				x: 0,
				y: 31,
				w: 48,
				h: 12,
				content: 'scale',
				figure: {
					figure: 'spending.category_by_year_grid',
					scope: all,
					chart: 'heatmap',
					normalize: 'col',
					mark: pickedYear,
					title: words('Category by year'),
					caption: words('category spending split per year')
				}
			},
			flow: {
				x: 0,
				y: 43,
				w: 48,
				h: 25,
				content: 'scale',
				figure: {
					figure: 'money.flow',
					scope,
					chart: 'sankey',
					title: words('Where it all went'),
					caption: {
						context: pickedYear ?? (lifetime ? 'Lifetime' : spanText),
						text: 'gross income to each spending category'
					}
				}
			},
			// Log scale, since a linear axis crushes the small categories under the biggest ones.
			categories: {
				x: 0,
				y: 68,
				w: 48,
				h: 18,
				content: 'scale',
				figure: {
					figure: 'spending.category_by_year',
					scope: all,
					chart: 'line',
					log: true,
					endLabels: true,
					mark: pickedYear,
					title: words('Spending by category, by year'),
					caption: words('log-scaled yearly trend of spending by category')
				}
			}
		})
	);

	// Headings and ids both come from the catalog's one ordered chain, so a heading cannot end up over
	// another measure's figure.
	const columns = CASH_FLOW_COLUMNS.map(columnHeading);
	const cellsOf = (pick: (c: (typeof CASH_FLOW_COLUMNS)[number]) => string) =>
		statCells(CASH_FLOW_COLUMNS.map(pick), all);

	// The averages carry no caption: their divisor is each figure's own footnote.
	const rows = $derived([
		{
			label: words(lifetime ? 'Lifetime total' : 'Total'),
			caption: live(spanText),
			cells: cellsOf((c) => c.total)
		},
		{ label: words('Avg / year'), cells: cellsOf((c) => c.perYear) },
		{ label: words('Avg / month'), cells: cellsOf((c) => c.perMonth) }
	]);
</script>

<Board key="analytics:year" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane
		id="cashflow"
		title={words(lifetime ? 'Lifetime cash flow' : 'Cash flow')}
		caption={{ context: spanText, text: 'totals, yearly, and monthly rates' }}
	>
		<StatMatrix {data} {columns} {rows} />
	</Pane>

	<FigurePane id="levels" {data} spec={PANES.levels.figure} picked={pickedYear} {onpick} />
	<FigurePane id="rate" {data} spec={PANES.rate.figure} picked={pickedYear} {onpick} />
	<FigurePane id="heatmap" {data} spec={PANES.heatmap.figure} />
	<FigurePane id="flow" {data} spec={PANES.flow.figure} />
	<FigurePane id="categories" {data} spec={PANES.categories.figure} />
</Board>
