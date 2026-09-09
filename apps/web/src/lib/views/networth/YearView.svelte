<script lang="ts">
	// Net Worth · Year — the flow half: what happened to your position this year and why.
	// Balances are logged monthly, so this is the range where editing belongs.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { Layout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Cell from '$lib/layout/grid/Cell.svelte';
	import FigureCell, { type FigureSpec } from '$lib/layout/grid/FigureCell.svelte';
	import StatStrip from '$lib/charts/StatStrip.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	const LAYOUT = {
		stats: { x: 0, y: 0, w: 48, h: 7, content: 'flow', mode: 'fit' },
		trend: { x: 0, y: 7, w: 24, h: 15, content: 'scale' },
		mix: { x: 24, y: 7, w: 24, h: 15, content: 'scale' },
		table: { x: 0, y: 22, w: 48, h: 16, content: 'flow', mode: 'cap', cap: 16 }
	} satisfies Layout;

	const FIGURES = $derived<Record<string, FigureSpec>>({
		trend: {
			figure: 'networth.by_month',
			scope: yr,
			chart: 'line',
			area: true,
			title: 'Net worth by month',
			cap: `${year} · one point per logged snapshot`
		},
		mix: {
			figure: 'networth.allocation_share',
			scope: yr,
			chart: 'stacked-area',
			title: 'Allocation mix',
			cap: 'Share of assets · liquid · taxable · tax-advantaged'
		},
		table: {
			figure: 'networth.monthly_table',
			scope: yr,
			chart: 'table',
			title: 'Monthly snapshots',
			cap: 'Month-over-month change'
		}
	});

	// One card, not five tiles: these figures are a single sentence — the position, then the two
	// forces that moved it, then the rate behind one of them.
	const stats = $derived([
		{ id: 'networth.change', scope: yr, cap: `end of ${year}` },
		{ id: 'networth.saved', scope: yr },
		{ id: 'networth.other', scope: yr },
		{ id: 'ratio.savings_rate', scope: yr, title: 'Savings rate', cap: 'of income kept' }
	]);
</script>

<Board key="networth:year" layout={LAYOUT}>
	<Cell
		id="stats"
		title={`${year} in position`}
		cap="Where you ended, and the two forces that got you there"
	>
		<StatStrip {data} cells={stats} />
	</Cell>

	{#each ['trend', 'mix', 'table'] as id (id)}
		<FigureCell {id} {data} spec={FIGURES[id]!} />
	{/each}
</Board>
