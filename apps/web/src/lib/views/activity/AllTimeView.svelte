<script lang="ts">
	// Activity · All time — the lifetime picture, read-only.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import { live, words } from '$lib/ui/label';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';
	import { yearSpan } from '$lib/utils/format';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };
	const years = $derived(data.meta.years);
	const span = $derived(yearSpan(years, 'no tracked years'));

	const PANES = $derived({
		// A block of figures, not a list: it scales like the KPI cards above it rather than owning its
		// own height, so it can be given room or taken down to where its rows would clip.
		cashflow: { x: 0, y: 0, w: 48, h: 9, content: 'scale' },
		// The full-width charts here are taller than the tops below them leave room for. The push rule
		// closes each overlap downwards, so the heights are authored and the tops are only floors.
		flow: {
			x: 0,
			y: 9,
			w: 48,
			h: 25,
			content: 'scale',
			figure: {
				figure: 'money.flow',
				scope: all,
				chart: 'sankey',
				title: words('Where it all went'),
				caption: { context: 'Lifetime', text: 'gross income to each spending category' }
			}
		},
		// Levels beside rate: how big, versus how efficient, which the bars alone can't say.
		levels: {
			x: 0,
			y: 34,
			w: 24,
			h: 13,
			content: 'scale',
			figure: {
				figure: 'overview.cash_flow_bars',
				scope: all,
				chart: 'bar',
				title: words('Net income vs take-home vs spending vs saved'),
				caption: words('per year')
			}
		},
		rate: {
			x: 24,
			y: 34,
			w: 24,
			h: 13,
			content: 'scale',
			figure: {
				figure: 'overview.savings_rate',
				scope: all,
				chart: 'line',
				title: words('Savings rate by year'),
				caption: words('of net income')
			}
		},
		// Log scale, because a linear axis crushes the small categories under the biggest ones. End
		// labels replace a legend with one swatch per category.
		categories: {
			x: 0,
			y: 47,
			w: 48,
			h: 25,
			content: 'scale',
			figure: {
				figure: 'spending.category_by_year',
				scope: all,
				chart: 'line',
				log: true,
				endLabels: true,
				title: words('Spending by category, by year'),
				caption: words('log-scaled yearly trend of spending by category')
			}
		}
	} satisfies BoardLayout);

	const columns = ['Income', 'Spent', 'Saved'];
	const rows = $derived([
		{
			label: words('Lifetime total'),
			caption: live(span),
			cells: [
				{ id: 'income.total', scope: all },
				{ id: 'spending.total', scope: all },
				{ id: 'saved.total', scope: all }
			]
		},
		{
			// No caption: how many years divide into it is each average's own footnote.
			label: words('Avg / year'),
			cells: [
				{ id: 'avg.income_per_year', scope: all },
				{ id: 'avg.spending_per_year', scope: all },
				{ id: 'avg.saved_per_year', scope: all }
			]
		}
	]);
</script>

<Board key="activity:all" layout={PANES}>
	<Pane
		id="cashflow"
		title={words('Lifetime cash flow')}
		caption={{ context: span, text: 'totals and their yearly run-rate' }}
	>
		<StatMatrix {data} {columns} {rows} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
