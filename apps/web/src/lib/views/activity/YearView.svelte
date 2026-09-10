<script lang="ts">
	// Activity · Year — read-only analysis. Entries are logged at day/month level, so there is
	// nothing to edit at this range; every element here answers a question the Month view can't.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import StatStrip from '$lib/charts/StatStrip.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// The statistics pane fits its content — it is a block of figures, not a chart, and its height is
	// entirely a function of how many rows of them there are. Everything below it is a chart, so it
	// scales to whatever the user gives it.
	const PANES = $derived({
		stats: { x: 0, y: 0, w: 48, h: 13, content: 'flow', mode: 'fit' },
		trend: {
			x: 0,
			y: 13,
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
		// The sankey is given more height than the tops below it leave room for: the heatmap's authored
		// top sits inside it, and the push rule moves the heatmap down rather than the sankey up. Stated
		// this way round so the sankey keeps its height if the heatmap is ever moved or removed.
		flow: {
			x: 0,
			y: 28,
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
		// The heatmap carries the category ranking implicitly — rows arrive ordered biggest-first — so
		// it defaults to the full width, where twelve columns plus the category gutter have room.
		heatmap: {
			x: 0,
			y: 47,
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
	} satisfies BoardLayout);

	const activeMonths = $derived(
		(data.years[String(year)]?.matrix ?? []).filter(
			(r) => r.income > 0 || Object.keys(r.spent).length > 0
		).length
	);

	// The gross→net chain as one card: four separate tiles both waste a row and hide the fact
	// that these subtract from each other.
	const income = $derived([
		{ id: 'income.gross', scope: yr, caption: 'before tax & deductions' },
		{ id: 'income.deductions', scope: yr, caption: 'tax + benefits' },
		{ id: 'income.contributions', scope: yr, caption: 'HSA + 401k' },
		{ id: 'income.net', scope: yr, caption: 'take-home + saved' }
	]);

	// Totals and their monthly run-rate over the same three measures — a 2×3 grid says that
	// relationship; six loose tiles don't. The second row answers "what am I averaging?".
	const columns = ['Income', 'Spent', 'Saved'];
	const cashflow = $derived([
		{
			label: `Total ${year}`,
			caption: 'across the year',
			cells: [
				{ id: 'income.total', scope: yr },
				{ id: 'spending.total', scope: yr },
				{ id: 'saved.total', scope: yr }
			]
		},
		{
			label: 'Avg / month',
			caption: `${activeMonths} active month${activeMonths === 1 ? '' : 's'}`,
			cells: [
				{ id: 'avg.income_per_month', scope: yr },
				{ id: 'avg.spending_per_month', scope: yr },
				{ id: 'avg.saved_per_month', scope: yr }
			]
		}
	]);
</script>

<Board key="activity:year" layout={PANES}>
	<!-- One statistics pane: the gross→net chain across the top, then the same three measures as
	     totals and as a monthly run-rate. Splitting these into two cards implied they were unrelated
	     readings when they are one account of the year. -->
	<Pane
		id="stats"
		title={`${year} statistics`}
		caption="Gross through to what you keep, then totals and run-rate"
	>
		<StatStrip {data} cells={income} />
		<div class="rule"></div>
		<StatMatrix {data} {columns} rows={cashflow} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>

<style>
	/* Separates the two halves of the statistics pane without implying two cards. */
	.rule {
		height: 1px;
		background: var(--border);
		margin: var(--gap-grid) 0;
	}
</style>
