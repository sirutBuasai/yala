<script lang="ts">
	// Visualization for a Table primitive: numeric columns are right-aligned and
	// formatted by their unit; text columns are left-aligned.
	import type { Table } from '$lib/data/primitives';
	import { formatUnit } from '$lib/data/primitives';
	import Empty from '$lib/ui/Empty.svelte';

	interface Props {
		table: Table;
	}
	let { table }: Props = $props();

	function cell(value: string | number, col: number): string {
		const unit = table.columns[col]?.unit;
		return typeof value === 'number' && unit ? formatUnit(value, unit) : String(value);
	}
</script>

{#if table.rows.length}
	<!-- The table scrolls SIDEWAYS inside its own pane rather than forcing the page to. A financial
	     table's columns can't be dropped or wrapped — every figure is load-bearing and a wrapped
	     number stops reading as a number — so once the columns need more width than the pane has,
	     scrolling them is the only option that keeps them all legible. -->
	<div class="tablebox scroller-x">
		<table>
			<thead>
				<tr>
					{#each table.columns as c (c.label)}
						<th scope="col" class:num={!!c.unit}>{c.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each table.rows as row, i (i)}
					<tr>
						{#each row as v, j (j)}
							<td class:num={!!table.columns[j]?.unit}>{cell(v, j)}</td>
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
	/* Horizontal only, from `.scroller-x`. No vertical cap: a table that scrolls vertically becomes a
	   second scroll region the wheel gets captured by, and these tables are short (one row per year
	   or per month) so the pane can simply be as tall as its data. */
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
</style>
