<script lang="ts">
	// Net Worth · All time — the stock half. Read-only: a balance belongs to the month it was taken in.
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
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };

	const PANES = {
		standing: { x: 0, y: 0, w: 48, h: 7, content: 'flow', mode: 'fit' },
		// Assets dashed so net worth stays the primary reading.
		trend: {
			x: 0,
			y: 7,
			w: 32,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'networth.vs_assets',
				scope: all,
				chart: 'line',
				area: true,
				dashed: ['Assets'],
				title: 'Net worth & assets over time',
				caption: 'Every logged snapshot — the gap between them is what you owe'
			}
		},
		thresholds: {
			x: 32,
			y: 7,
			w: 16,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'networth.thresholds',
				scope: all,
				chart: 'bullet',
				title: 'Progress to thresholds',
				caption: 'Value, its target, and the bands either side'
			}
		},
		liabilities: {
			x: 0,
			y: 22,
			w: 16,
			h: 13,
			content: 'scale',
			figure: {
				figure: 'networth.liabilities_trend',
				scope: all,
				chart: 'line',
				// No `color` override: the registry's role map already colours this series by its name.
				title: 'Liabilities',
				caption: 'What you owe, on a scale you can read'
			}
		},
		forces: {
			x: 16,
			y: 22,
			w: 32,
			h: 13,
			content: 'scale',
			figure: {
				figure: 'networth.saved_vs_other',
				scope: all,
				chart: 'bar',
				title: 'You vs the market, by year',
				caption: 'What you saved against everything else that moved the balance'
			}
		},
		// Stacked rather than overlaid: a band's thickness answers "what's the mix" directly.
		mix: {
			x: 0,
			y: 35,
			w: 24,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'networth.allocation_share',
				scope: all,
				chart: 'stacked-area',
				title: 'Allocation mix over time',
				caption: 'Share of assets — the level is already in the trend above'
			}
		},
		accounts: {
			x: 24,
			y: 35,
			w: 24,
			h: 15,
			content: 'scale',
			figure: {
				figure: 'networth.accounts',
				scope: all,
				chart: 'ranked-bars',
				// Keyed by ACCOUNT, so each bar takes its institution's hue rather than the category
				// fallback, which gave every bar the same colour.
				colorBy: 'account',
				title: 'Where the money sits',
				caption: 'Every asset account, largest first — concentration at a glance'
			}
		},
		table: {
			x: 0,
			y: 50,
			w: 48,
			h: 16,
			content: 'flow',
			mode: 'fit',
			figure: {
				figure: 'networth.year_table',
				scope: all,
				chart: 'table',
				title: 'Year by year',
				caption: 'The audit trail behind every chart above'
			}
		}
	} satisfies BoardLayout;

	// A strip holds only as many cells as fit one row; another would wrap and break the alignment.
	// "Balance growth" is deliberately not called a return.
	const standing = $derived([
		{ id: 'networth.change', scope: all },
		{ id: 'networth.assets', scope: all },
		{ id: 'networth.balance_growth', scope: all },
		{ id: 'networth.top_account', scope: all }
	]);
</script>

<Board key="networth:all" layout={PANES}>
	<Pane
		id="standing"
		title="Where this has got you"
		caption="Position and pace across every logged snapshot"
	>
		<StatStrip {data} cells={standing} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
