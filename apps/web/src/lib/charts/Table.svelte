<script lang="ts">
	// Visualization for a Table primitive: numeric columns are right-aligned and
	// formatted by their unit; text columns are left-aligned.
	import type { Table } from '$lib/data/primitives';
	import { formatUnit } from '$lib/data/primitives';

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
	<p class="empty">No data.</p>
{/if}

<style>
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th,
	td {
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
		text-align: left;
	}
	th {
		color: var(--ink-3);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		font-weight: 600;
	}
	td {
		color: var(--ink-2);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.empty {
		color: var(--ink-3);
	}
</style>
