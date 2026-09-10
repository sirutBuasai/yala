<script lang="ts">
	// Activity · All time — the lifetime picture, read-only.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
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
		cashflow: { x: 0, y: 0, w: 48, h: 9, content: 'flow', mode: 'fit' },
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
				title: 'Where it all went',
				caption: 'Lifetime · gross → deductions → spending categories → saved'
			}
		},
		// Levels beside rate: how big, versus how efficient, which the bars alone can't say.
		levels: {
			x: 0,
			y: 28,
			w: 24,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'overview.income_spent_saved',
				scope: all,
				chart: 'bar',
				title: 'Income vs spending vs saved',
				caption: 'Absolute levels per year'
			}
		},
		rate: {
			x: 24,
			y: 28,
			w: 24,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'overview.savings_rate',
				scope: all,
				chart: 'line',
				title: 'Savings rate by year',
				caption: 'Saved ÷ income — habit quality, independent of earnings'
			}
		},
		// Log scale, because a linear axis crushes the small categories under the biggest ones. End
		// labels replace a legend with one swatch per category.
		categories: {
			x: 0,
			y: 43,
			w: 48,
			h: 25,
			content: 'scale',
			figure: {
				figure: 'spending.category_by_year',
				scope: all,
				chart: 'line',
				log: true,
				endLabels: true,
				title: 'Spending by category, by year',
				caption: 'One line per category · log scale, so every category has readable room'
			}
		}
	} satisfies BoardLayout);

	const columns = ['Income', 'Spent', 'Saved'];
	const rows = $derived([
		{
			label: 'Lifetime total',
			caption: span,
			cells: [
				{ id: 'income.total', scope: all },
				{ id: 'spending.total', scope: all },
				{ id: 'saved.total', scope: all }
			]
		},
		{
			label: 'Avg / year',
			caption: `${years.length} tracked year${years.length === 1 ? '' : 's'}`,
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
		title="Lifetime cash flow"
		caption={`${span} · totals and their yearly run-rate`}
	>
		<StatMatrix {data} {columns} {rows} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
