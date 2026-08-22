<script lang="ts">
	import type { DashboardData } from '$lib/types';
	import { overviewKpis } from '$lib/kpis';
	import { categorySlices, type Slice } from '$lib/charts/slices';
	import { sankeyModel } from '$lib/charts/sankey';
	import Kpi from './Kpi.svelte';
	import Pane from './Pane.svelte';
	import Donut from './charts/Donut.svelte';
	import GroupedBarChart from './charts/GroupedBarChart.svelte';
	import LineChart from './charts/LineChart.svelte';
	import Sankey from './charts/Sankey.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const byYear = $derived(data.overview.by_year);
	const years = $derived(byYear.map((r) => String(r.year)));

	const lifetimeIncome = $derived(byYear.reduce((a, r) => a + r.income, 0));
	const lifetimeSpent = $derived(byYear.reduce((a, r) => a + r.spent, 0));

	// Lifetime "where it all went": top categories (capped) + a distinct Saved slice.
	const slices = $derived.by<Slice[]>(() => {
		const saved = lifetimeIncome - lifetimeSpent;
		const savedShown = lifetimeIncome > 0 && saved > 0;
		// Cap the donut at 10 total slices; the Saved slice counts, so leave room for it.
		const s = categorySlices(data.overview.all_time_by_category, savedShown ? 9 : 10);
		if (savedShown) s.push({ name: 'Saved', value: saved, color: 'var(--saved)' });
		return s;
	});

	const incomeSpentSaved = $derived([
		{ name: 'Income', values: byYear.map((r) => r.income), color: 'var(--lav)' },
		{ name: 'Spent', values: byYear.map((r) => r.spent), color: 'var(--salmon)' },
		{ name: 'Saved', values: byYear.map((r) => r.saved), color: 'var(--saved)' }
	]);

	const flow = $derived(sankeyModel(data));

	const cumulative = $derived.by(() => {
		let run = 0;
		const values = byYear.map((r) => (run += r.saved));
		return [{ name: 'Cumulative saved', values, color: 'var(--saved)', area: true }];
	});

	const savingsRate = $derived([
		{
			name: 'Savings rate',
			values: byYear.map((r) => (r.income ? (r.saved / r.income) * 100 : 0)),
			color: 'var(--lav)'
		}
	]);
</script>

<div class="ohead">
	<h2 class="serif">Overview</h2>
	<span class="sub">Lifetime · {years[0]}–{years[years.length - 1]}</span>
</div>

<div class="kpis">
	{#each overviewKpis(data) as t (t.label)}
		<Kpi label={t.label} value={t.value} delta={t.delta} dir={t.dir} foot={t.foot} />
	{/each}
</div>

<div class="panes two">
	<Pane title="Where it all went" cap="Lifetime">
		<Donut {slices} />
	</Pane>
	<Pane title="Income vs Spending vs Savings" cap="Per tracked year">
		<GroupedBarChart labels={years} series={incomeSpentSaved} />
	</Pane>
</div>

<div class="panes">
	<Pane title="Money flow" cap="Lifetime · gross → deductions → spending → savings">
		<Sankey nodes={flow.nodes} links={flow.links} />
	</Pane>
</div>

<div class="panes two">
	<Pane title="Cumulative savings" cap="Running total of yearly saved">
		<LineChart labels={years} series={cumulative} />
	</Pane>
	<Pane title="Savings rate by year" cap="Savings to income ratio">
		<LineChart labels={years} series={savingsRate} percent />
	</Pane>
</div>

<style>
	.ohead {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 16px;
	}
	.ohead h2 {
		font-size: 22px;
		font-weight: 600;
		margin: 0;
	}
	.ohead .sub {
		color: var(--ink-3);
		font-size: 12.5px;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
		margin-bottom: 18px;
	}
	.panes {
		display: grid;
		gap: 14px;
		margin-bottom: 14px;
	}
	.panes.two {
		grid-template-columns: 1fr 1fr;
		align-items: stretch; /* paired panes share the taller one's height */
	}
	@media (max-width: 900px) {
		.kpis {
			grid-template-columns: repeat(2, 1fr);
		}
		.panes.two {
			grid-template-columns: 1fr;
		}
	}
</style>
