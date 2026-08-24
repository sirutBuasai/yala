<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import { overviewScalars } from '$lib/data/scalar';
	import { build } from '$lib/data/catalog';
	import ViewHeader from '$lib/ui/ViewHeader.svelte';
	import KpiRow from '$lib/ui/KpiRow.svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import Figure from '$lib/charts/Figure.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const years = $derived(data.overview.by_year.map((r) => String(r.year)));

	// Every panel just binds a catalog primitive to a chart — no colour/series assembly here.
	const donut = $derived(build(data, 'spending.where_it_went', { level: 'all' }));
	const incomeSpentSaved = $derived(build(data, 'overview.income_spent_saved', { level: 'all' }));
	const flow = $derived(build(data, 'money.flow', { level: 'all' }));
	const cumulative = $derived(build(data, 'overview.cumulative_saved', { level: 'all' }));
	const savingsRate = $derived(build(data, 'overview.savings_rate', { level: 'all' }));
</script>

<ViewHeader title="Overview">
	<span class="sub">Lifetime · {years[0]}–{years[years.length - 1]}</span>
</ViewHeader>

<KpiRow tiles={overviewScalars(data)} cols={3} />

<div class="panes two">
	<Pane title="Where it all went" cap="Lifetime">
		<Figure primitive={donut} chart="donut" />
	</Pane>
	<Pane title="Income vs Spending vs Savings" cap="Per tracked year">
		<Figure primitive={incomeSpentSaved} chart="bar" />
	</Pane>
</div>

<div class="panes">
	<Pane title="Money flow" cap="Lifetime · gross → deductions → spending → savings">
		<Figure primitive={flow} chart="sankey" />
	</Pane>
</div>

<div class="panes two">
	<Pane title="Cumulative savings" cap="Running total of yearly saved">
		<Figure primitive={cumulative} chart="line" area />
	</Pane>
	<Pane title="Savings rate by year" cap="Savings to income ratio">
		<Figure primitive={savingsRate} chart="line" />
	</Pane>
</div>

<style>
	.sub {
		color: var(--ink-3);
		font-size: 12.5px;
	}
</style>
