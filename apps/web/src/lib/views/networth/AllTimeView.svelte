<script lang="ts">
	// Net Worth · All time — the stock half: where this has got you, how fast, how far to go, and
	// how exposed. Read-only: a balance belongs to the month it was taken in.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { Layout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Cell from '$lib/layout/grid/Cell.svelte';
	import FigureCell, { type FigureSpec } from '$lib/layout/grid/FigureCell.svelte';
	import StatStrip from '$lib/charts/StatStrip.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };

	const LAYOUT = {
		standing: { x: 0, y: 0, w: 48, h: 7, content: 'flow', mode: 'fit' },
		trend: { x: 0, y: 7, w: 32, h: 15, content: 'scale' },
		thresholds: { x: 32, y: 7, w: 16, h: 15, content: 'scale' },
		liabilities: { x: 0, y: 22, w: 16, h: 13, content: 'scale' },
		forces: { x: 16, y: 22, w: 32, h: 13, content: 'scale' },
		mix: { x: 0, y: 35, w: 24, h: 15, content: 'scale' },
		accounts: { x: 24, y: 35, w: 24, h: 15, content: 'scale' },
		table: { x: 0, y: 50, w: 48, h: 16, content: 'flow', mode: 'cap', cap: 16 }
	} satisfies Layout;

	const FIGURES: Record<string, FigureSpec> = {
		// Net worth against assets: the gap between the lines is what you owe. Assets dashed so net
		// worth stays the primary reading. Beside it, the same page's targets as gauges — the bullets
		// carry value, target and bands, so the numbers don't also need tiles of their own.
		trend: {
			figure: 'networth.vs_assets',
			scope: all,
			chart: 'line',
			area: true,
			dashed: ['Assets'],
			title: 'Net worth & assets over time',
			cap: 'Every logged snapshot — the gap between them is what you owe'
		},
		thresholds: {
			figure: 'networth.thresholds',
			scope: all,
			chart: 'bullet',
			title: 'Progress to thresholds',
			cap: 'Value, its target, and the bands either side'
		},
		liabilities: {
			figure: 'networth.liabilities_trend',
			scope: all,
			chart: 'line',
			// No `color` override: the series is named "Liabilities", and the registry's role map
			// already gives that name salmon everywhere it appears. An override here would be a
			// second place for the same fact to live — and drift from.
			title: 'Liabilities',
			cap: 'What you owe, on a scale you can read'
		},
		forces: {
			figure: 'networth.saved_vs_other',
			scope: all,
			chart: 'bar',
			title: 'You vs the market, by year',
			cap: 'What you saved against everything else that moved the balance'
		},
		// Stacked rather than overlaid: the question is the mix, and a band's thickness answers it
		// directly where three crossing lines make you compare heights by eye.
		mix: {
			figure: 'networth.allocation_share',
			scope: all,
			chart: 'stacked-area',
			title: 'Allocation mix over time',
			cap: 'Share of assets — the level is already in the trend above'
		},
		accounts: {
			figure: 'networth.accounts',
			scope: all,
			chart: 'ranked-bars',
			// These bars are keyed by ACCOUNT, so they take their institution's hue — the same one
			// the account's dot wears in the balance checklist — rather than the category fallback,
			// which made every bar the same lavender.
			colorBy: 'account',
			title: 'Where the money sits',
			cap: 'Every asset account, largest first — concentration at a glance'
		},
		table: {
			figure: 'networth.year_table',
			scope: all,
			chart: 'table',
			title: 'Year by year',
			cap: 'The audit trail behind every chart above'
		}
	};

	// Four per strip: a fifth wraps onto its own row and breaks the alignment that makes a strip
	// readable as one row of figures. "Balance growth" is deliberately not called a return.
	const standing = $derived([
		{ id: 'networth.change', scope: all },
		{ id: 'networth.assets', scope: all },
		{ id: 'networth.balance_growth', scope: all },
		{ id: 'networth.top_account', scope: all }
	]);
</script>

<Board key="networth:all" layout={LAYOUT}>
	<Cell
		id="standing"
		title="Where this has got you"
		cap="Position and pace across every logged snapshot"
	>
		<StatStrip {data} cells={standing} />
	</Cell>

	{#each Object.keys(FIGURES) as id (id)}
		<FigureCell {id} {data} spec={FIGURES[id]!} />
	{/each}
</Board>
