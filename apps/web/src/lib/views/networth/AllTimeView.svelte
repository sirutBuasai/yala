<script lang="ts">
	// Net Worth · All time — the stock half: where this has got you, how fast, how far to go, and
	// how exposed. Read-only: a balance belongs to the month it was taken in.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import Board, { type Cell } from '$lib/layout/Board.svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import StatStrip from '$lib/charts/StatStrip.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };

	// Four per strip: a fifth wraps onto its own row and breaks the alignment that makes a strip
	// readable as one row of figures. "Balance growth" is deliberately not called a return.
	const standing = $derived([
		{ id: 'networth.change', scope: all },
		{ id: 'networth.assets', scope: all },
		{ id: 'networth.balance_growth', scope: all },
		{ id: 'networth.top_account', scope: all }
	]);

	// Net worth against assets: the gap between the lines is what you owe. Assets dashed so net
	// worth stays the primary reading. Beside it, the same page's targets as gauges — the bullets
	// carry value, target and bands, so the numbers don't also need tiles of their own.
	const trend = $derived([
		{
			id: 'networth.vs_assets',
			scope: all,
			chart: 'line',
			area: true,
			dashed: ['Assets'],
			title: 'Net worth & assets over time',
			cap: 'Every logged snapshot — the gap between them is what you owe',
			span: 4
		},
		{
			id: 'networth.thresholds',
			scope: all,
			chart: 'bullet',
			title: 'Progress to thresholds',
			cap: 'Value, its target, and the bands either side',
			span: 2
		}
	]);

	const forces = $derived([
		{
			id: 'networth.liabilities_trend',
			scope: all,
			chart: 'line',
			// No `color` override: the series is named "Liabilities", and the registry's role map
			// already gives that name salmon everywhere it appears. An override here would be a
			// second place for the same fact to live — and drift from.
			title: 'Liabilities',
			cap: 'What you owe, on a scale you can read',
			span: 2
		},
		{
			id: 'networth.saved_vs_other',
			scope: all,
			chart: 'bar',
			title: 'You vs the market, by year',
			cap: 'What you saved against everything else that moved the balance',
			span: 4
		}
	]);

	// Stacked rather than overlaid: the question is the mix, and a band's thickness answers it
	// directly where three crossing lines make you compare heights by eye.
	const mix = $derived<Cell[]>([
		{
			id: 'networth.allocation_share',
			scope: all,
			chart: 'stacked-area',
			title: 'Allocation mix over time',
			cap: 'Share of assets — the level is already in the trend above',
			span: 3
		},
		{
			id: 'networth.accounts',
			scope: all,
			chart: 'ranked-bars',
			// These bars are keyed by ACCOUNT, so they take their institution's hue — the same one
			// the account's dot wears in the balance checklist — rather than the category fallback,
			// which made every bar the same lavender.
			colorBy: 'account',
			title: 'Where the money sits',
			cap: 'Every asset account, largest first — concentration at a glance',
			span: 3
		}
	]);

	const detail = $derived([
		{
			id: 'networth.year_table',
			scope: all,
			chart: 'table',
			title: 'Year by year',
			cap: 'The audit trail behind every chart above',
			span: 6
		}
	]);
</script>

<div class="panes">
	<Pane title="Where this has got you" cap="Position and pace across every logged snapshot">
		<StatStrip {data} cells={standing} />
	</Pane>
</div>

<Board {data} cells={trend} />
<Board {data} cells={forces} />
<Board {data} cells={mix} />
<Board {data} cells={detail} />
