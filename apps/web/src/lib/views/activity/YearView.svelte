<script lang="ts">
	// Activity · Year — read-only analysis. Entries are logged at day/month level, so there is
	// nothing to edit at this range; every element here answers a question the Month view can't.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { Layout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Cell from '$lib/layout/grid/Cell.svelte';
	import FigureCell, { type FigureSpec } from '$lib/layout/grid/FigureCell.svelte';
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
	const LAYOUT = {
		stats: { x: 0, y: 0, w: 48, h: 13, content: 'flow', mode: 'fit' },
		trend: { x: 0, y: 13, w: 48, h: 15, content: 'scale' },
		flow: { x: 0, y: 28, w: 48, h: 19, content: 'scale' },
		heatmap: { x: 0, y: 47, w: 48, h: 17, content: 'scale' }
	} satisfies Layout;

	const FIGURES = $derived<Record<string, FigureSpec>>({
		trend: {
			figure: 'overview.income_spent_saved',
			scope: yr,
			chart: 'bar',
			title: 'Income vs spending vs saved',
			cap: `${year} · per month`
		},
		flow: {
			figure: 'money.flow',
			scope: yr,
			chart: 'sankey',
			title: 'Money flow',
			cap: `${year} · gross → deductions → spending → saved`
		},
		// The heatmap carries the category ranking implicitly — rows arrive ordered biggest-first — so
		// it defaults to the full width, where twelve columns plus the category gutter have room.
		heatmap: {
			figure: 'spending.category_by_month',
			scope: yr,
			chart: 'heatmap',
			title: 'Category by month',
			cap: 'Biggest category first · each row scaled to its own max, so a quiet category stays readable'
		}
	});

	const activeMonths = $derived(
		(data.years[String(year)]?.matrix ?? []).filter(
			(r) => r.income > 0 || Object.keys(r.spent).length > 0
		).length
	);

	// The gross→net chain as one card: four separate tiles both waste a row and hide the fact
	// that these subtract from each other.
	const income = $derived([
		{ id: 'income.gross', scope: yr, cap: 'before tax & deductions' },
		{ id: 'income.deductions', scope: yr, cap: 'tax + benefits' },
		{ id: 'income.contributions', scope: yr, cap: 'HSA + 401k' },
		{ id: 'income.net', scope: yr, cap: 'take-home + saved' }
	]);

	// Totals and their monthly run-rate over the same three measures — a 2×3 grid says that
	// relationship; six loose tiles don't. The second row answers "what am I averaging?".
	const columns = ['Income', 'Spent', 'Saved'];
	const cashflow = $derived([
		{
			label: `Total ${year}`,
			cap: 'across the year',
			cells: [
				{ id: 'income.total', scope: yr },
				{ id: 'spending.total', scope: yr },
				{ id: 'saved.total', scope: yr }
			]
		},
		{
			label: 'Avg / month',
			cap: `${activeMonths} active month${activeMonths === 1 ? '' : 's'}`,
			cells: [
				{ id: 'avg.income_per_month', scope: yr },
				{ id: 'avg.spending_per_month', scope: yr },
				{ id: 'avg.saved_per_month', scope: yr }
			]
		}
	]);
</script>

<Board key="activity:year" layout={LAYOUT}>
	<!-- One statistics pane: the gross→net chain across the top, then the same three measures as
	     totals and as a monthly run-rate. Splitting these into two cards implied they were unrelated
	     readings when they are one account of the year. -->
	<Cell
		id="stats"
		title={`${year} statistics`}
		cap="Gross through to what you keep, then totals and run-rate"
	>
		<StatStrip {data} cells={income} />
		<div class="rule"></div>
		<StatMatrix {data} {columns} rows={cashflow} />
	</Cell>

	{#each ['trend', 'flow', 'heatmap'] as id (id)}
		<FigureCell {id} {data} spec={FIGURES[id]!} />
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
