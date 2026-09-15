<script lang="ts">
	// Activity · Year — read-only, since entries are logged at day/month level.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import { live, words } from '$lib/ui/label';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';
	import { cashFlowChain, cashFlowChanges, cashFlowHeading } from '$lib/data/catalog';
	import { statCells } from '$lib/charts/statMatrix';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// Two columns, each read top to bottom. The chain first, each term with its own accumulation behind
	// it — an area running up to the year's total says how evenly it arrived. No badges: the terms
	// subtract from each other, and a change against last year belongs to the cash-flow matrix.
	//
	// Then net income and the three rates it is the base of. Net leads because the two rates under it
	// divide it; the deduction rate is of gross, so it sits beneath net rather than atop the chain.
	const KPIS = $derived<KpiBoardDefs>({
		gross: {
			rect: { x: 0, y: 0, w: 8, h: 6 },
			spec: { figure: 'income.gross', scope: yr, chart: 'area', series: 'running.gross' }
		},
		deductions: {
			rect: { x: 0, y: 6, w: 8, h: 5 },
			spec: { figure: 'income.deductions', scope: yr, chart: 'area', series: 'running.deductions' }
		},
		contributions: {
			rect: { x: 0, y: 11, w: 8, h: 5 },
			spec: {
				figure: 'income.contributions',
				scope: yr,
				chart: 'area',
				series: 'running.contributions'
			}
		},
		takehome: {
			rect: { x: 0, y: 16, w: 8, h: 5 },
			// Overrides the catalog's caption: this one names the thing that arrives rather than describing
			// what the measure means.
			spec: {
				figure: 'income.takehome',
				scope: yr,
				chart: 'area',
				series: 'running.takehome',
				caption: words('direct deposit')
			}
		},
		net: {
			rect: { x: 8, y: 0, w: 8, h: 6 },
			spec: { figure: 'income.net', scope: yr, chart: 'area', series: 'running.net' }
		},
		deductionRate: {
			rect: { x: 8, y: 6, w: 8, h: 5 },
			spec: { figure: 'ratio.deduction_rate', scope: yr, chart: 'ring' }
		},
		spendingRate: {
			rect: { x: 8, y: 11, w: 8, h: 5 },
			spec: { figure: 'ratio.spending_rate', scope: yr, chart: 'ring' }
		},
		savingsRate: {
			rect: { x: 8, y: 16, w: 8, h: 5 },
			spec: { figure: 'ratio.savings_rate', scope: yr, chart: 'ring' }
		}
	});

	const kpis = useKpiBoard('activity:year', () => KPIS, [
		{ ids: ['gross', 'deductions', 'contributions', 'takehome'], axis: 'column' },
		{ ids: ['net', 'deductionRate', 'spendingRate', 'savingsRate'], axis: 'column' }
	]);

	const PANES = $derived(
		kpis.board({
			// `scale` so the matrix is given room or taken down to where its rows would clip, like a KPI card.
			cashflow: { x: 16, y: 0, w: 32, h: 10, content: 'scale' },
			trend: {
				x: 16,
				y: 10,
				w: 32,
				h: 11,
				content: 'scale',
				figure: {
					figure: 'overview.cash_flow_bars',
					scope: yr,
					chart: 'bar',
					title: words('Net income vs take-home vs spending vs saved'),
					caption: { context: String(year), text: 'per month' }
				}
			},
			flow: {
				x: 0,
				y: 39,
				w: 48,
				h: 24,
				content: 'scale',
				figure: {
					figure: 'money.flow',
					scope: yr,
					chart: 'sankey',
					title: words('Where it all went'),
					caption: {
						context: String(year),
						text: 'gross income to each spending category'
					}
				}
			},
			// Categories arrive biggest-first, so the ranking is implicit left to right. Scaled per column,
			// since it is the categories that span orders of magnitude.
			heatmap: {
				x: 0,
				y: 21,
				w: 48,
				h: 18,
				content: 'scale',
				figure: {
					figure: 'spending.category_by_month',
					scope: yr,
					chart: 'heatmap',
					normalize: 'col',
					title: words('Category by month'),
					caption: words('category spending split per month')
				}
			}
		})
	);

	// Totals and their monthly run-rate over the same measures, so a glance down a column relates the
	// two. Both rows compare against last year — the run-rate against last year's own run-rate, so a
	// part-finished year is not read as a collapse.
	const CHAIN = cashFlowChain(['income', 'spending', 'saved']);
	const columns = CHAIN.map(cashFlowHeading);

	// The run-rate row carries no caption: its divisor is each measure's own active months, which the
	// figures state per cell.
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
</script>

<Board key="activity:year" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane
		id="cashflow"
		title={{ context: String(year), text: 'cash flow' }}
		caption={words('comparison against previous year and run-rate')}
	>
		<StatMatrix {data} {columns} rows={cashflow} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
