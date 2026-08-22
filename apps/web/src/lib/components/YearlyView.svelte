<script lang="ts">
	import type { DashboardData } from '$lib/types';
	import { categoryVar } from '$lib/theme';
	import { MONTHS, money } from '$lib/format';
	import { incomeKpis, spendingKpis } from '$lib/kpis';
	import { SERIES_BY_ID, type Scope } from '$lib/series';
	import { sumValues } from '$lib/num';
	import YearHeader from './YearHeader.svelte';
	import KpiRow from './KpiRow.svelte';
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

	// Picker options: the tracked years, one empty year past the latest, and wherever we've
	// navigated to — so stepping to a not-yet-populated year still shows a valid selection
	// (its KPIs and charts read as zero).
	const years = $derived.by(() => {
		const ys = data.meta.years;
		const latest = ys.length ? ys[ys.length - 1] : year;
		return [...new Set([...ys, latest + 1, year])].sort((a, b) => b - a);
	});

	function extract(id: string, scope: Scope) {
		return SERIES_BY_ID[id].extract(data, scope);
	}

	const yearSpent = $derived(data.years[String(year)]?.total_spent ?? 0);

	// Income vs Spent vs Saved per month (net income from the year matrix).
	const grouped = $derived.by(() => {
		const yd = data.years[String(year)];
		const income = MONTHS.map((_, m) => yd?.matrix[m]?.income ?? 0);
		const spent = MONTHS.map((_, m) => sumValues(yd?.matrix[m]?.spent ?? {}));
		const saved = income.map((v, i) => v - spent[i]);
		return [
			{ name: 'Income', values: income, color: 'var(--lav)' },
			{ name: 'Spent', values: spent, color: 'var(--salmon)' },
			{ name: 'Saved', values: saved, color: 'var(--saved)' }
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

	// Heatmap with months on the row axis and categories on the column axis (axis flipped
	// vs. the source matrix, which is categories × months).
	const catMatrix = $derived.by(() => {
		const n = extract('spending.category_by_month', { level: 'year', year });
		if (n.shape !== 'matrix')
			return { rows: MONTHS, cols: [] as string[], values: [] as number[][] };
		const cats = n.rows; // categories
		const values = MONTHS.map((_, m) => cats.map((_, c) => n.values[c]?.[m] ?? 0));
		return { rows: MONTHS, cols: cats, values };
	});
</script>

<YearHeader title="Yearly" {years} bind:year tiles={incomeKpis(data, year)} />

<KpiRow tiles={spendingKpis(data, year)} />

<div class="panes">
	<Pane title="Income vs Spending vs Savings" cap={`${year} · Per tracked month`}>
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
	<Pane title="Category by month" cap="Spending per category per month.">
		<CategoryByMonthTable rows={catMatrix.rows} cols={catMatrix.cols} values={catMatrix.values} />
	</Pane>
</div>
