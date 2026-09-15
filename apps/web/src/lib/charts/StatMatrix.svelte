<script lang="ts">
	// A grid of figures where rows and columns both carry meaning. As loose tiles that structure is
	// invisible and costs a row of height; as a matrix the layout says it and a glance down a column
	// compares.
	//
	// A cell's number is a plain level and never coloured; a period-over-period change rides along as a
	// badge, which is where the colour goes.
	import type { DashboardData } from '$lib/data/types';
	import { NO_VALUE } from '$lib/copy';
	import type { StatRow } from '$lib/charts/statMatrix';
	import { build } from '$lib/data/catalog';
	import { deltaLabel, formatUnit, type Scalar } from '$lib/data/primitives';
	import Badge, { badgeTone } from '$lib/ui/Badge.svelte';
	import { DOT, labelText } from '$lib/ui/label';

	interface Props {
		data: DashboardData;
		/** Column headers, in the same order as each row's cells. */
		columns: string[];
		rows: StatRow[];
	}
	let { data, columns, rows }: Props = $props();

	const body = $derived(
		rows.map((r) => {
			const values = r.cells.map((c) => {
				const s = build(data, c.id, c.scope) as Scalar;
				const d = s.delta;
				return {
					key: c.id,
					text: s.value === null ? NO_VALUE : formatUnit(s.value, s.unit),
					// Read to text here: the row's cells are compared for agreement below, and two notes saying
					// the same thing arrive as two objects.
					note: labelText(s.note),
					badge: d ? { text: deltaLabel(d), tone: badgeTone(d.tone) } : null
				};
			});
			// A note must hold for the whole row: once under the label when every cell agrees, per cell when
			// they differ, dropped when only some carry one.
			const notes = values.map((v) => v.note);
			const everyCell = notes.every(Boolean);
			const shared = everyCell && new Set(notes).size === 1;
			return {
				...r,
				label: labelText(r.label),
				caption:
					[labelText(r.caption), shared ? notes[0] : null].filter(Boolean).join(DOT) || undefined,
				values: everyCell && !shared ? values : values.map((v) => ({ ...v, note: undefined }))
			};
		})
	);
</script>

<!-- Scrolls sideways inside its pane rather than out through the card: a column here is a period and a
     row a measure, so neither can be dropped or wrapped to make the figures fit (as in `charts/Table`). -->
<div class="matrixbox scroller-x">
	<table class="matrix">
		<thead>
			<tr>
				<th class="rh"><span class="vh">Period</span></th>
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
</div>

<style>
	/* Zero, so the table's own min-content cannot widen the card instead of scrolling here. */
	.matrixbox {
		min-width: 0;
	}
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
	/* Never wrapped: overflowing is what makes the grid refuse the resize, where reflowing would let the
	   pane go on narrowing while the table quietly degraded. */
	.figure {
		display: inline-flex;
		align-items: baseline;
		justify-content: flex-end;
		white-space: nowrap;
		gap: 0 var(--gap-row);
		font-family: var(--font-display);
		font-size: var(--text-figure);
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
