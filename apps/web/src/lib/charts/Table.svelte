<script lang="ts">
	// A Table primitive: numeric columns are right-aligned and formatted by their unit, text columns
	// left-aligned. A column may also declare a tint, which shades its cells by magnitude.
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

	/**
	 * Each tinted column's largest magnitude, which is what its shading is scaled against. Per column,
	 * never across the table: a column of hundreds would never tint beside one of tens of thousands.
	 */
	const peaks = $derived(
		table.columns.map((c, j) =>
			c.tint
				? Math.max(
						...table.rows.map((r) => (typeof r[j] === 'number' ? Math.abs(r[j] as number) : 0))
					)
				: 0
		)
	);

	/** A cell's shade: which way the news runs, and how strongly, or null where nothing is shaded. The
	    depth is a fraction here and scaled by the theme in CSS, as every other mark in the app is. */
	function shade(value: string | number, col: number): { good: boolean; a: number } | null {
		const dir = table.columns[col]?.tint;
		if (!dir || typeof value !== 'number' || value === 0) return null;

		const peak = peaks[col] ?? 0;
		if (!peak) return null;

		return {
			good: value > 0 === (dir === 'up-good'),
			// Floored, so the smallest real movement is still visible rather than indistinguishable from no
			// movement at all.
			a: 0.25 + 0.75 * (Math.abs(value) / peak)
		};
	}
</script>

{#if table.rows.length}
	<!-- Scrolls sideways inside its own pane rather than forcing the page to. These columns can't be
	     dropped or wrapped — every figure is load-bearing — so scrolling is the only way to keep them
	     all legible once they outgrow the pane. -->
	<div class="tablebox scroller-x">
		<table>
			<thead>
				<tr>
					<!-- Keyed by position, not by label: a table that repeats a heading beside each level it
					     belongs to has several columns called the same thing, and a duplicate key is fatal. -->
					{#each table.columns as c, i (i)}
						<th scope="col" class:num={!!c.unit}>{c.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each table.rows as row, i (i)}
					<tr>
						{#each row as v, j (j)}
							{@const sh = shade(v, j)}
							<td
								class:num={!!table.columns[j]?.unit}
								class:tinted={!!sh}
								style:--a={sh ? sh.a : null}
								style:--tint={sh ? `var(--${sh.good ? 'good' : 'crit'})` : null}
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
	/* Horizontal only. No vertical cap: a table that scrolls vertically becomes a second scroll region
	   the wheel gets captured by, and these tables are short enough for the pane to be as tall as its
	   data. */
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
	   the table's own grid. Shares `--mark-tile` with the heatmap: a shaded cell is a shaded cell, and the
	   two sit on the same boards. Strength is per theme (see app.css). */
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
