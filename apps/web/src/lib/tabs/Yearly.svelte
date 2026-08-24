<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import { money } from '$lib/utils/format';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import Board from '$lib/layout/Board.svelte';

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
	const yr = $derived<Scope>({ level: 'year', year });

	// Income breakdown KPIs. The savings rate is its own tile rather than a delta on Net.
	const incomeCells = $derived([
		{ id: 'income.gross', scope: yr, cap: 'before tax & deductions' },
		{ id: 'income.deductions', scope: yr, cap: 'tax + benefits' },
		{ id: 'income.contributions', scope: yr, cap: 'HSA + 401k' },
		{ id: 'income.net', scope: yr, cap: 'take-home + saved' },
		{ id: 'ratio.savings_rate', scope: yr, title: '% saved', cap: 'of income' }
	]);

	// Spending / cash-flow KPIs (averages carry their own active-month note).
	const spendingCells = $derived([
		{ id: 'spending.total', scope: yr, title: `Spent ${year}`, cap: 'across the year' },
		{ id: 'avg.income_per_month', scope: yr },
		{ id: 'avg.spending_per_month', scope: yr },
		{ id: 'avg.saved_per_month', scope: yr }
	]);

	const chartCells = $derived([
		{
			id: 'overview.income_spent_saved',
			scope: yr,
			chart: 'bar',
			title: 'Income vs Spending vs Savings',
			cap: `${year} · Per tracked month`,
			span: 6
		},
		{
			id: 'spending.by_month',
			scope: yr,
			chart: 'bar',
			color: 'var(--salmon)',
			title: 'Spending by month',
			cap: `${year} · total ${money(yearSpent)}`,
			span: 3
		},
		{
			id: 'spending.by_category',
			scope: yr,
			chart: 'ranked-bars',
			total: yearSpent,
			title: 'Category split',
			cap: `${year}`,
			span: 3
		},
		{
			id: 'spending.category_by_month',
			scope: yr,
			chart: 'heatmap',
			title: 'Category by month',
			cap: 'Spending per category per month.',
			span: 6
		}
	]);
</script>

<ViewHeader title="Yearly">
	<YearNav value={year} {years} onchange={(y) => (year = y)} />
</ViewHeader>

<Board {data} cells={incomeCells} cols={5} />
<Board {data} cells={spendingCells} cols={4} />
<Board {data} cells={chartCells} />
