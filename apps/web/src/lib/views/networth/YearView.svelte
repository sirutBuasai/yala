<script lang="ts">
	// Net Worth · Year — the flow half. Balances are logged monthly, so editing belongs at this range.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import StatStrip from '$lib/charts/StatStrip.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	const PANES = $derived({
		stats: { x: 0, y: 0, w: 48, h: 7, content: 'flow', mode: 'fit' },
		trend: {
			x: 0,
			y: 7,
			w: 24,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'networth.by_month',
				scope: yr,
				chart: 'line',
				area: true,
				title: 'Net worth by month',
				caption: `${year} · one point per logged snapshot`
			}
		},
		mix: {
			x: 24,
			y: 7,
			w: 24,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'networth.allocation_share',
				scope: yr,
				chart: 'stacked-area',
				title: 'Allocation mix',
				caption: 'Share of assets · liquid · taxable · tax-advantaged'
			}
		},
		table: {
			x: 0,
			y: 22,
			w: 48,
			h: 16,
			content: 'flow',
			mode: 'fit',
			figure: {
				figure: 'networth.monthly_table',
				scope: yr,
				chart: 'table',
				title: 'Monthly snapshots',
				caption: 'Month-over-month change'
			}
		}
	} satisfies BoardLayout);

	// One card, not loose tiles: the position, the forces that moved it, and the rate behind one of them.
	const stats = $derived([
		{ id: 'networth.change', scope: yr, caption: `end of ${year}` },
		{ id: 'networth.saved', scope: yr },
		{ id: 'networth.other', scope: yr },
		{ id: 'ratio.savings_rate', scope: yr, title: 'Savings rate', caption: 'of income kept' }
	]);
</script>

<Board key="networth:year" layout={PANES}>
	<Pane
		id="stats"
		title={`${year} in position`}
		caption="Where you ended, and the two forces that got you there"
	>
		<StatStrip {data} cells={stats} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
