<script lang="ts">
	// Net Worth · All time — the stock half: where this has got you, how fast, how far to go, and
	// how exposed. Read-only: a balance belongs to the month it was taken in.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import Board from '$lib/layout/Board.svelte';
	import Pane from '$lib/layout/Pane.svelte';
	import StatStrip from '$lib/layout/StatStrip.svelte';

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

	// Distance to the thresholds that matter, every one sized from your own spending. The FI number
	// itself isn't a tile — it's the denominator, and it already reads in FI progress's note.
	const targets = $derived([
		{ id: 'networth.fi_progress', scope: all },
		{ id: 'networth.years_of_freedom', scope: all },
		{ id: 'networth.runway', scope: all },
		{ id: 'networth.coast_fi', scope: all }
	]);

	// One net-worth line, not net worth beside assets: with liabilities at a fraction of a percent
	// the two trace the same path, so the second line restates the first. Liabilities get their own
	// pane where their own scale makes them legible.
	const trend = $derived([
		{
			id: 'networth.by_month',
			scope: all,
			chart: 'line',
			area: true,
			title: 'Net worth over time',
			cap: 'Every logged snapshot',
			span: 4
		},
		{
			id: 'networth.liabilities_trend',
			scope: all,
			chart: 'line',
			color: 'var(--salmon)',
			title: 'Liabilities',
			cap: 'What you owe, on a scale you can read',
			span: 2
		}
	]);

	const forces = $derived([
		{
			id: 'networth.saved_vs_other',
			scope: all,
			chart: 'bar',
			title: 'You vs the market, by year',
			cap: 'What you saved against everything else that moved the balance',
			span: 3
		},
		{
			id: 'networth.allocation_share',
			scope: all,
			chart: 'line',
			title: 'Allocation mix over time',
			cap: 'Share of assets — the level is already in the trend above',
			span: 3,
			endLabels: true
		}
	]);

	const where = $derived([
		{
			id: 'networth.accounts',
			scope: all,
			chart: 'ranked-bars',
			title: 'Where the money sits',
			cap: 'Every asset account, largest first — concentration at a glance',
			span: 3
		},
		{
			id: 'networth.year_table',
			scope: all,
			chart: 'table',
			title: 'Year by year',
			cap: 'The audit trail behind every chart above',
			span: 3
		}
	]);
</script>

<div class="panes two">
	<Pane title="Where this has got you" cap="Position and pace across every logged snapshot">
		<StatStrip {data} cells={standing} />
	</Pane>
	<Pane title="How far to go" cap="Each figure sized from your own spending, at your stated rate">
		<StatStrip {data} cells={targets} />
	</Pane>
</div>

<Board {data} cells={trend} />
<Board {data} cells={forces} />
<Board {data} cells={where} />
