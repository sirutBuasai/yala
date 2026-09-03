<script lang="ts">
	// Net Worth · Year — the flow half: what happened to your position this year and why.
	// Balances are logged monthly, so this is the range where editing belongs.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import Board from '$lib/layout/Board.svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import StatStrip from '$lib/charts/StatStrip.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// One card, not five tiles: these figures are a single sentence — the position, then the two
	// forces that moved it, then the rate behind one of them.
	const stats = $derived([
		{ id: 'networth.change', scope: yr, cap: `end of ${year}` },
		{ id: 'networth.saved', scope: yr },
		{ id: 'networth.other', scope: yr },
		{ id: 'ratio.savings_rate', scope: yr, title: 'Savings rate', cap: 'of income kept' }
	]);

	const shape = $derived([
		{
			id: 'networth.by_month',
			scope: yr,
			chart: 'line',
			area: true,
			title: 'Net worth by month',
			cap: `${year} · one point per logged snapshot`,
			span: 3
		},
		{
			id: 'networth.allocation_share',
			scope: yr,
			chart: 'stacked-area',
			title: 'Allocation mix',
			cap: 'Share of assets · liquid · taxable · tax-advantaged',
			span: 3
		}
	]);

	const detail = $derived([
		{
			id: 'networth.monthly_table',
			scope: yr,
			chart: 'table',
			title: 'Monthly snapshots',
			cap: 'Month-over-month change',
			span: 6
		}
	]);
</script>

<div class="panes">
	<Pane title={`${year} in position`} cap="Where you ended, and the two forces that got you there">
		<StatStrip {data} cells={stats} />
	</Pane>
</div>

<Board {data} cells={shape} />
<Board {data} cells={detail} />
