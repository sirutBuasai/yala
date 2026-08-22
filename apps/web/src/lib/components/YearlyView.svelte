<script lang="ts">
	import type { DashboardData } from '$lib/types';
	import { categoryVar } from '$lib/theme';
	import { MONTHS, money } from '$lib/format';
	import { incomeKpis, spendingKpis } from '$lib/kpis';
	import { SERIES_BY_ID, type Scope } from '$lib/series';
	import YearHeader from './YearHeader.svelte';
	import Kpi from './Kpi.svelte';
	import Pane from './Pane.svelte';
	import VBarChart from './charts/VBarChart.svelte';
	import HBarChart from './charts/HBarChart.svelte';
	import GroupedBarChart from './charts/GroupedBarChart.svelte';
	import CategoryByMonthTable from './CategoryByMonthTable.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year = $bindable() }: Props = $props();

	const years = $derived([...data.meta.years].sort((a, b) => b - a));

	function extract(id: string, scope: Scope) {
		return SERIES_BY_ID[id].extract(data, scope);
	}

	const yearSpent = $derived(data.years[String(year)]?.total_spent ?? 0);

	// Income vs Spent vs Saved per month (net income from the year matrix).
	const grouped = $derived.by(() => {
		const yd = data.years[String(year)];
		const income = MONTHS.map((_, m) => yd?.matrix[m]?.income ?? 0);
		const spent = MONTHS.map((_, m) =>
			Object.values(yd?.matrix[m]?.spent ?? {}).reduce((a, b) => a + b, 0)
		);
		const saved = income.map((v, i) => v - spent[i]);
		return [
			{ name: 'Income', values: income, color: 'var(--lav)' },
			{ name: 'Spent', values: spent, color: 'var(--salmon)' },
			{ name: 'Saved', values: saved, color: 'var(--green)' }
		];
	});

	const byMonth = $derived.by(() => {
		const n = extract('spending.by_month', { level: 'year', year });
		return n.shape === 'time' ? n.data.map((d) => d.value) : [];
	});

	const catSplit = $derived.by(() => {
		const n = extract('spending.by_category', { level: 'year', year });
		const rows = n.shape === 'categorical' ? n.data : [];
		return rows.map((r) => ({ label: r.key, value: r.value, color: categoryVar(r.key) }));
	});

	const catMatrix = $derived.by(() => {
		const n = extract('spending.category_by_month', { level: 'year', year });
		return n.shape === 'matrix' ? n : { rows: [], cols: MONTHS, values: [] };
	});
</script>

<YearHeader title="Yearly" {years} bind:year tiles={incomeKpis(data, year)} />

<div class="kpis">
	{#each spendingKpis(data, year) as t (t.label)}
		<Kpi label={t.label} value={t.value} delta={t.delta} dir={t.dir} foot={t.foot} />
	{/each}
</div>

<div class="panes">
	<Pane
		title="Income vs Spent vs Saved"
		cap={`${year} · net income, spending, and what's left per month`}
	>
		<GroupedBarChart labels={MONTHS} series={grouped} />
	</Pane>
</div>

<div class="panes two">
	<Pane title="Spending by month" cap={`${year} · total ${money(yearSpent)}`}>
		<VBarChart labels={MONTHS} values={byMonth} color="var(--salmon)" />
	</Pane>
	<Pane title="Category split" cap={`${year}`}>
		<HBarChart items={catSplit} total={yearSpent} />
	</Pane>
</div>

<div class="panes">
	<Pane title="Category by month" cap="Darker lavender = more spent. Values in $.">
		<CategoryByMonthTable rows={catMatrix.rows} cols={catMatrix.cols} values={catMatrix.values} />
	</Pane>
</div>

<style>
	.kpis {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
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
