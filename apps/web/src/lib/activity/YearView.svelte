<script lang="ts">
	// Activity · Year — read-only analysis. Entries are logged at day/month level, so there is
	// nothing to edit at this range; every element here answers a question the Month view can't.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import Board from '$lib/layout/Board.svelte';
	import Pane from '$lib/layout/Pane.svelte';
	import StatStrip from '$lib/layout/StatStrip.svelte';
	import StatMatrix from '$lib/layout/StatMatrix.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });
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

	const trend = $derived([
		{
			id: 'overview.income_spent_saved',
			scope: yr,
			chart: 'bar',
			title: 'Income vs spending vs saved',
			cap: `${year} · per month`,
			span: 6
		}
	]);

	const flow = $derived([
		{
			id: 'money.flow',
			scope: yr,
			chart: 'sankey',
			title: 'Money flow',
			cap: `${year} · gross → deductions → spending → saved`,
			span: 6
		}
	]);

	// The heatmap takes the full width: twelve columns plus the category gutter need the room, and
	// it already carries the category ranking implicitly — rows arrive ordered biggest-first.
	const heatmap = $derived([
		{
			id: 'spending.category_by_month',
			scope: yr,
			chart: 'heatmap',
			title: 'Category by month',
			cap: 'Biggest category first · each row scaled to its own max, so a quiet category stays readable',
			span: 6
		}
	]);
</script>

<!-- One statistics pane: the gross→net chain across the top, then the same three measures as
     totals and as a monthly run-rate. Splitting these into two cards implied they were unrelated
     readings when they are one account of the year. -->
<div class="panes">
	<Pane title={`${year} statistics`} cap="Gross through to what you keep, then totals and run-rate">
		<StatStrip {data} cells={income} />
		<div class="rule"></div>
		<StatMatrix {data} {columns} rows={cashflow} />
	</Pane>
</div>

<Board {data} cells={trend} />
<Board {data} cells={flow} />
<Board {data} cells={heatmap} />

<style>
	/* Separates the two halves of the statistics pane without implying two cards. */
	.rule {
		height: 1px;
		background: var(--border);
		margin: var(--gap-grid) 0;
	}
</style>
