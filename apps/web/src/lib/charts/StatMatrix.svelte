<script lang="ts">
	// A grid of figures where the rows and columns both carry meaning — the same measures across two
	// time bases, say. As loose tiles they'd hide that structure and eat a row of height; as a matrix
	// the layout says it, and a glance down a column compares. Cells are catalog ids, so a new row or
	// column is data rather than markup.
	//
	// A cell's number is a plain level and is never coloured. Where a cell's figure carries a
	// period-over-period change, that change rides along as a badge, which is where the colour goes.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import { build } from '$lib/data/catalog';
	import { formatDelta, formatUnit, type Scalar } from '$lib/data/primitives';
	import Badge, { badgeTone } from '$lib/ui/Badge.svelte';

	interface Cell {
		id: string;
		scope: Scope;
	}
	interface Row {
		label: string;
		/** Small print under the row label. */
		caption?: string;
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
				const d = s.delta;
				return {
					key: c.id,
					text: s.value === null ? '—' : formatUnit(s.value, s.unit),
					// The figure's OWN caption, per cell: the divisor behind a run-rate differs by measure,
					// so no one row caption can state it.
					note: s.note,
					badge: d
						? {
								text: formatDelta(d.value, d.unit) + (d.note ? ` ${d.note}` : ''),
								tone: badgeTone(d.tone)
							}
						: null
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
					{#if r.caption}<small>{r.caption}</small>{/if}
				</th>
				{#each r.values as v (v.key)}
					<td>
						<span class="figure">
							{v.text}
							{#if v.badge}<Badge tone={v.badge.tone}>{v.badge.text}</Badge>{/if}
						</span>
						{#if v.note}<small>{v.note}</small>{/if}
					</td>
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
	}
	td small {
		display: block;
		color: var(--ink-3);
		font-size: var(--text-caption);
	}
	/* Never wrapped: a cell that reflowed would let the pane go on narrowing while the table quietly
	   degraded. Overflowing instead is what makes the grid refuse the resize. */
	.figure {
		display: inline-flex;
		align-items: baseline;
		justify-content: flex-end;
		white-space: nowrap;
		gap: 0 var(--gap-row);
		font-family: var(--font-display);
		font-size: var(--text-title);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--ls-tighter);
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
