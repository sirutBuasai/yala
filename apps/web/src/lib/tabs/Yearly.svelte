<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import { money } from '$lib/utils/format';
	import { incomeScalars, spendingScalars } from '$lib/data/scalar';
	import { build } from '$lib/data/catalog';
	import ViewHeader from '$lib/ui/ViewHeader.svelte';
	import YearNav from '$lib/ui/YearNav.svelte';
	import KpiRow from '$lib/ui/KpiRow.svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import Figure from '$lib/charts/Figure.svelte';

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
		const latest = ys[ys.length - 1] ?? year;
		return [...new Set([...ys, latest + 1, year])].sort((a, b) => b - a);
	});

	const yearSpent = $derived(data.years[String(year)]?.total_spent ?? 0);

	const incomeSpentSaved = $derived(
		build(data, 'overview.income_spent_saved', { level: 'year', year })
	);
	const byMonth = $derived(build(data, 'spending.by_month', { level: 'year', year }));
	const catSplit = $derived(build(data, 'spending.by_category', { level: 'year', year }));
	const catMatrix = $derived(build(data, 'spending.category_by_month', { level: 'year', year }));
</script>

<ViewHeader title="Yearly">
	<YearNav value={year} {years} onchange={(y) => (year = y)} />
</ViewHeader>

<KpiRow tiles={incomeScalars(data, year)} />
<KpiRow tiles={spendingScalars(data, year)} />

<div class="panes">
	<Pane title="Income vs Spending vs Savings" cap={`${year} · Per tracked month`}>
		<Figure primitive={incomeSpentSaved} chart="bar" />
	</Pane>
</div>

<div class="panes two">
	<Pane title="Spending by month" cap={`${year} · total ${money(yearSpent)}`}>
		<Figure primitive={byMonth} chart="bar" color="var(--salmon)" />
	</Pane>
	<Pane title="Category split" cap={`${year}`}>
		<Figure primitive={catSplit} chart="ranked-bars" total={yearSpent} />
	</Pane>
</div>

<div class="panes">
	<Pane title="Category by month" cap="Spending per category per month.">
		<Figure primitive={catMatrix} chart="heatmap" />
	</Pane>
</div>
