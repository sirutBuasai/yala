<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import ViewHeader from '$lib/ui/layout/ViewHeader.svelte';
	import Board from '$lib/ui/layout/Board.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const years = $derived(data.overview.by_year.map((r) => String(r.year)));

	const all: Scope = { level: 'all' };

	const cells = $derived([
		{ id: 'income.total', scope: all, title: 'Lifetime income', span: 2 },
		{ id: 'spending.total', scope: all, title: 'Lifetime spent', span: 2 },
		{ id: 'saved.total', scope: all, title: 'Lifetime saved', span: 2 },
		{ id: 'avg.income_per_year', scope: all, span: 2 },
		{ id: 'avg.spending_per_year', scope: all, span: 2 },
		{ id: 'avg.saved_per_year', scope: all, span: 2 },
		{
			id: 'spending.where_it_went',
			scope: all,
			chart: 'donut',
			title: 'Where it all went',
			cap: 'Lifetime',
			span: 3
		},
		{
			id: 'overview.income_spent_saved',
			scope: all,
			chart: 'bar',
			title: 'Income vs Spending vs Savings',
			cap: 'Per tracked year',
			span: 3
		},
		{
			id: 'money.flow',
			scope: all,
			chart: 'sankey',
			title: 'Money flow',
			cap: 'gross → deductions → spending → savings',
			span: 6
		},
		{
			id: 'overview.cumulative_saved',
			scope: all,
			chart: 'line',
			area: true,
			title: 'Cumulative savings',
			cap: 'Running total of yearly saved',
			span: 3
		},
		{
			id: 'overview.savings_rate',
			scope: all,
			chart: 'line',
			title: 'Savings rate by year',
			cap: 'Savings to income ratio',
			span: 3
		}
	]);
</script>

<ViewHeader title="Overview">
	<span class="sub">Lifetime · {years[0]}–{years[years.length - 1]}</span>
</ViewHeader>

<Board {data} {cells} />

<style>
	.sub {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
</style>
