<script lang="ts">
	// A Table primitive: numeric columns are right-aligned and formatted by their unit, text columns
	// left-aligned. A column may also declare a tint, which shades its cells by magnitude.
	import type { Table } from '$lib/data/primitives';
	import { formatUnit } from '$lib/data/primitives';
	import Empty from '$lib/ui/Empty.svelte';
	import { shadeHue, tableShades } from '$lib/charts/heat';

	interface Props {
		table: Table;
	}
	let { table }: Props = $props();

	function cell(value: string | number, col: number): string {
		const unit = table.columns[col]?.unit;
		return typeof value === 'number' && unit ? formatUnit(value, unit) : String(value);
	}

	const shades = $derived(tableShades(table));
</script>

{#if table.rows.length}
	<!-- Scrolls sideways in its pane: every column is load-bearing, so none can drop or wrap. -->
	<div class="tablebox scroller-x">
		<table>
			<thead>
				<tr>
					<!-- Keyed by position, not by label: a heading may repeat beside each level it belongs to,
					     and a duplicate key is fatal. -->
					{#each table.columns as c, i (i)}
						<th scope="col" class:num={!!c.unit}>{c.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each table.rows as row, i (i)}
					<tr>
						{#each row as v, j (j)}
							{@const sh = shades[i]?.[j]}
							<td
								class:num={!!table.columns[j]?.unit}
								class:tinted={!!sh}
								style:--a={sh ? sh.a : null}
								style:--tint={sh ? shadeHue(sh.good) : null}
							>
								{cell(v, j)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<Empty>No data.</Empty>
{/if}

<style>
	/* Horizontal only: a vertical scroller captures the wheel as a second scroll region. */
	.tablebox {
		min-width: 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-control);
	}
	th,
	td {
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border);
		text-align: left;
		/* Figures never wrap: a number broken across two lines stops reading as one number. */
		white-space: nowrap;
	}
	th {
		color: var(--ink-3);
		font-size: var(--text-column);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		font-weight: var(--fw-semibold);
	}
	td {
		color: var(--ink-2);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	/* Inset rather than edge-to-edge, so the shading reads as belonging to the figure instead of redrawing
	   the table's own grid. Shares `--mark-tile` with the heatmap, whose cells sit on the same boards. */
	.tinted {
		position: relative;
		isolation: isolate;
	}
	.tinted::before {
		content: '';
		position: absolute;
		inset: 2px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--tint) calc(var(--a) * var(--mark-tile)), transparent);
		z-index: -1;
	}
</style>
