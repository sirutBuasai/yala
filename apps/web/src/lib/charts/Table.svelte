<script lang="ts">
	// Visualization for a Table primitive: numeric columns are right-aligned and
	// formatted by their unit; text columns are left-aligned.
	import type { Table } from '$lib/data/primitives';
	import { formatUnit } from '$lib/data/primitives';
	import Empty from '$lib/layout/Empty.svelte';

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
	<table>
		<thead>
			<tr>
				{#each table.columns as c (c.label)}
					<th class:num={!!c.unit}>{c.label}</th>
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
{:else}
	<Empty>No data.</Empty>
{/if}

<style>
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
