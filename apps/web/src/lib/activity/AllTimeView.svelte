<script lang="ts">
	// Activity · All time — the lifetime picture. Read-only, and deliberately not a bigger copy of
	// the Year view: the sankey is the definitive "where did it all go" (which is why the lifetime
	// donut is gone — the sankey strictly contains it), and levels-vs-rate are paired so the two
	// charts answer different questions instead of restating one.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import Board from '$lib/layout/Board.svelte';
	import Pane from '$lib/layout/Pane.svelte';
	import StatMatrix from '$lib/layout/StatMatrix.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };
	const years = $derived(data.meta.years);
	const span = $derived(
		years.length ? `${years[0]}–${years[years.length - 1]}` : 'no tracked years'
	);

	// Master's six overview KPIs were always this grid: three measures, two time bases.
	const columns = ['Income', 'Spent', 'Saved'];
	const rows = $derived([
		{
			label: 'Lifetime total',
			cap: span,
			cells: [
				{ id: 'income.total', scope: all },
				{ id: 'spending.total', scope: all },
				{ id: 'saved.total', scope: all }
			]
		},
		{
			label: 'Avg / year',
			cap: `${years.length} tracked year${years.length === 1 ? '' : 's'}`,
			cells: [
				{ id: 'avg.income_per_year', scope: all },
				{ id: 'avg.spending_per_year', scope: all },
				{ id: 'avg.saved_per_year', scope: all }
			]
		}
	]);

	const flow = $derived([
		{
			id: 'money.flow',
			scope: all,
			chart: 'sankey',
			title: 'Where it all went',
			cap: 'Lifetime · gross → deductions → spending categories → saved',
			span: 6
		}
	]);

	// Levels beside rate: how big, versus how efficient — the one thing the bars can't say, read
	// side by side. (Cumulative savings is intentionally absent: it retold the same saved story a
	// third time, and the compounding view belongs on Net Worth.)
	const trends = $derived([
		{
			id: 'overview.income_spent_saved',
			scope: all,
			chart: 'bar',
			title: 'Income vs spending vs saved',
			cap: 'Absolute levels per year',
			span: 3
		},
		{
			id: 'overview.savings_rate',
			scope: all,
			chart: 'line',
			title: 'Savings rate by year',
			cap: 'Saved ÷ income — habit quality, independent of earnings',
			span: 3
		}
	]);

	// Log scale: the biggest category runs ~20× the smallest, so a linear axis crushes everything
	// under the top one or two lines. End labels replace a legend that would need ten swatches.
	const categories = $derived([
		{
			id: 'spending.category_by_year',
			scope: all,
			chart: 'line',
			log: true,
			endLabels: true,
			title: 'Spending by category, by year',
			cap: 'One line per category · log scale, so every category has readable room',
			span: 6
		}
	]);
</script>

<div class="panes">
	<Pane title="Lifetime cash flow" cap={`${span} · totals and their yearly run-rate`}>
		<StatMatrix {data} {columns} {rows} />
	</Pane>
</div>

<Board {data} cells={flow} />
<Board {data} cells={trends} />
<Board {data} cells={categories} />
