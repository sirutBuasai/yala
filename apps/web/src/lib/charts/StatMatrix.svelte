<script lang="ts">
	// A grid of figures where the ROWS and COLUMNS both carry meaning — e.g. totals vs run-rate
	// (rows) across income / spent / saved (columns). Six such figures as six loose tiles hide the
	// structure they already have and eat a whole row of height; as a matrix the layout itself says
	// "same three measures, two different time bases", and a glance down a column compares them.
	//
	// Cells are catalog ids, so a new row or column is data, not markup.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import { build } from '$lib/data/catalog';
	import { formatUnit, type Scalar } from '$lib/data/primitives';

	interface Cell {
		id: string;
		scope: Scope;
	}
	interface Row {
		label: string;
		/** Small print under the row label (what this time base actually covers). */
		cap?: string;
		cells: Cell[];
	}
	interface Props {
		data: DashboardData;
		/** Column headers, in the same order as each row's cells. */
		columns: string[];
		rows: Row[];
	}
	let { data, columns, rows }: Props = $props();

	const body = $derived(
		rows.map((r) => ({
			...r,
			values: r.cells.map((c) => {
				const s = build(data, c.id, c.scope) as Scalar;
				return {
					key: c.id,
					text: s.value === null ? '—' : formatUnit(s.value, s.unit),
					dir: s.dir
				};
			})
		}))
	);
</script>

<table class="matrix">
	<thead>
		<tr>
			<th class="rh"><span class="vh">Measure</span></th>
			{#each columns as c (c)}<th>{c}</th>{/each}
		</tr>
	</thead>
	<tbody>
		{#each body as r (r.label)}
			<tr>
				<th class="rl" scope="row">
					{r.label}
					{#if r.cap}<small>{r.cap}</small>{/if}
				</th>
				{#each r.values as v (v.key)}
					<td class={v.dir ?? ''}>{v.text}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.matrix {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		color: var(--ink-3);
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		font-weight: var(--fw-semibold);
		text-align: right;
		padding: 0 0 var(--space-5) var(--gap-grid);
	}
	.rh {
		text-align: left;
		padding-left: 0;
	}
	/* The corner cell needs no visible text, but the column still needs a name for screen readers. */
	.vh {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	td {
		text-align: right;
		padding: var(--space-5) 0 var(--space-5) var(--gap-grid);
		border-top: 1px solid var(--border);
		font-family: var(--font-display);
		font-size: var(--text-title);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--ls-tighter);
	}
	td.up {
		color: var(--good-text);
	}
	td.down {
		color: var(--crit-text);
	}
	.rl {
		text-align: left;
		padding: var(--space-5) 0;
		border-top: 1px solid var(--border);
		font-family: var(--font-body);
		font-size: var(--text-control);
		font-weight: var(--fw-medium);
		color: var(--ink-2);
		letter-spacing: normal;
		text-transform: none;
		white-space: nowrap;
	}
	.rl small {
		display: block;
		color: var(--ink-3);
		font-size: var(--text-caption);
		font-weight: var(--fw-regular);
	}
</style>
