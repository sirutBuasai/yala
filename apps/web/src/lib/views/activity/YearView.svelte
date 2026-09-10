<script lang="ts">
	// Activity · Year — read-only, since entries are logged at day/month level.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { KpiBoard } from '$lib/kpi/board.svelte';
	import { setKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// The gross → net chain, each with its own accumulation behind it: an area running up to the year's
	// total says how evenly it arrived, which the total alone cannot. No badges — these four subtract
	// from each other, and a change against last year belongs to the cash-flow matrix below.
	const KPIS = $derived<KpiBoardDefs>({
		gross: {
			rect: { x: 0, y: 0, w: 12, h: 7 },
			spec: { figure: 'income.gross', scope: yr, chart: 'area', series: 'running.gross' }
		},
		contributions: {
			rect: { x: 12, y: 0, w: 12, h: 7 },
			spec: {
				figure: 'income.contributions',
				scope: yr,
				chart: 'area',
				series: 'running.contributions'
			}
		},
		deductions: {
			rect: { x: 24, y: 0, w: 12, h: 7 },
			spec: { figure: 'income.deductions', scope: yr, chart: 'area', series: 'running.deductions' }
		},
		net: {
			rect: { x: 36, y: 0, w: 12, h: 7 },
			spec: { figure: 'income.net', scope: yr, chart: 'area', series: 'running.net' }
		}
	});

	const kpis = new KpiBoard('activity:year', () => KPIS);
	setKpiBoard(kpis);

	// The cash-flow pane fits its content, being a block of figures whose height follows its rows.
	// Everything below it is a chart, so it scales to whatever height the user gives it.
	const PANES = $derived(
		kpis.board({
			// A block of figures, not a list: it scales like the KPI cards above it rather than owning its
			// own height, so it can be given room or taken down to where its rows would clip.
			cashflow: { x: 0, y: 7, w: 48, h: 10, content: 'scale' },
			trend: {
				x: 0,
				y: 17,
				w: 48,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'overview.income_spent_saved',
					scope: yr,
					chart: 'bar',
					title: 'Income vs spending vs saved',
					caption: `${year} · per month`
				}
			},
			// The sankey is taller than the heatmap's authored top leaves room for; the push rule moves the
			// heatmap down rather than shortening the sankey. Stated this way round so the sankey keeps its
			// height if the heatmap is ever moved or removed.
			flow: {
				x: 0,
				y: 32,
				w: 48,
				h: 26,
				content: 'scale',
				figure: {
					figure: 'money.flow',
					scope: yr,
					chart: 'sankey',
					title: 'Money flow',
					caption: `${year} · gross → deductions → spending → saved`
				}
			},
			// Rows arrive ordered biggest-first, so the ranking is implicit; it defaults to the full width,
			// where a column per month plus the category gutter have room.
			heatmap: {
				x: 0,
				y: 51,
				w: 48,
				h: 17,
				content: 'scale',
				figure: {
					figure: 'spending.category_by_month',
					scope: yr,
					chart: 'heatmap',
					title: 'Category by month',
					caption:
						'Biggest category first · each row scaled to its own max, so a quiet category stays readable'
				}
			}
		})
	);

	// Totals and their monthly run-rate over the same measures: a grid says that relationship, loose
	// cards don't. The year's row carries how each figure moved against last year; the run-rate row is
	// a rate, which has no year to compare against.
	const columns = ['Income', 'Spent', 'Saved'];
	const cashflow = $derived([
		{
			label: `Total ${year}`,
			caption: 'across the year, against last',
			cells: [
				{ id: 'change.income_yoy', scope: yr },
				{ id: 'change.spending_yoy', scope: yr },
				{ id: 'change.saved_yoy', scope: yr }
			]
		},
		{
			// No caption: the divisor is each measure's OWN active months, so the figures state it per
			// cell rather than one line claiming a count only some of them used.
			label: 'Avg / month',
			cells: [
				{ id: 'avg.income_per_month', scope: yr },
				{ id: 'avg.spending_per_month', scope: yr },
				{ id: 'avg.saved_per_month', scope: yr }
			]
		}
	]);
</script>

<Board key="activity:year" layout={PANES} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane id="cashflow" title={`${year} cash flow`} caption="Totals against last year, then run-rate">
		<StatMatrix {data} {columns} rows={cashflow} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
