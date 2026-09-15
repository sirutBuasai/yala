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

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// Two columns, each read top to bottom. The chain first: gross, then what came out of it, then what
	// reached the account, each with its own accumulation behind it — an area running up to the year's
	// total says how evenly it arrived, which the total alone cannot. No badges on these; they subtract
	// from each other, and a change against last year belongs to the cash-flow matrix.
	//
	// Then net income and the three rates it is the base of: the chain says how much, a share of a whole
	// says how the year was run. Net leads because the two rates under it divide it; the deduction rate
	// is of gross, so it takes the column's own top slot beneath net rather than claiming the chain's.
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
			// "Direct deposit" over the figure's own note: it is the name of the thing that arrives, where
			// the catalog's caption describes what the measure means.
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

	// The cash-flow pane fits its content, being a block of figures whose height follows its rows.
	// Everything below it is a chart, so it scales to whatever height the user gives it.
	const PANES = $derived(
		kpis.board({
			// A block of figures, not a list: it scales like the KPI cards above it rather than owning its
			// own height, so it can be given room or taken down to where its rows would clip.
			cashflow: { x: 16, y: 0, w: 32, h: 9, content: 'scale' },
			trend: {
				x: 16,
				y: 9,
				w: 32,
				h: 12,
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
			// A row per month, reading down the year; categories arrive ordered biggest-first, so the
			// ranking is implicit left to right. Scaled per COLUMN, since it is the categories that span
			// orders of magnitude — down a column is where the intensity means something.
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

	// Totals and their monthly run-rate over the same measures: a grid says that relationship, loose
	// cards don't. Both rows carry how they moved against last year — the run-rate against last year's
	// OWN run-rate, so a part-finished year is not read as a collapse.
	const columns = ['Income', 'Spent', 'Saved'];
	const cashflow = $derived([
		{
			label: live(`Total ${year}`),
			caption: words('across the year, against last'),
			cells: [
				{ id: 'change.income_yoy', scope: yr },
				{ id: 'change.spending_yoy', scope: yr },
				{ id: 'change.saved_yoy', scope: yr }
			]
		},
		{
			// No caption: the divisor is each measure's OWN active months, so the figures state it per
			// cell rather than one line claiming a count only some of them used.
			label: words('Avg / month'),
			cells: [
				{ id: 'avg.income_per_month', scope: yr },
				{ id: 'avg.spending_per_month', scope: yr },
				{ id: 'avg.saved_per_month', scope: yr }
			]
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
