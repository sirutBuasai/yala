<script lang="ts">
	// Several related figures as one card of divided cells, instead of one card each.
	//
	// Use it when the numbers form a single chain or set — gross → deductions → contributions → net
	// is one arithmetic story, so four separate tiles both waste a row of vertical space and hide
	// the relationship. Cells are built from catalog ids exactly like Board's, so adding a figure is
	// a one-line change and the labels/units stay owned by the data layer.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import { build } from '$lib/data/catalog';
	import { formatUnit, type Scalar } from '$lib/data/primitives';

	interface Cell {
		/** Catalog id of a scalar. */
		id: string;
		scope: Scope;
		/** Label override; the scalar titles itself otherwise. */
		title?: string;
		/** Footnote under the value; the scalar's own note otherwise. */
		cap?: string;
	}
	interface Props {
		data: DashboardData;
		cells: Cell[];
	}
	let { data, cells }: Props = $props();

	const items = $derived(
		cells.map((c) => {
			const s = build(data, c.id, c.scope) as Scalar;
			return {
				key: c.id,
				label: c.title ?? s.label,
				value: s.value === null ? '—' : formatUnit(s.value, s.unit),
				note: c.cap ?? s.note,
				dir: s.dir
			};
		})
	);
</script>

<dl class="strip">
	{#each items as it (it.key)}
		<div class="c">
			<dt>{it.label}</dt>
			<dd class={it.dir ?? ''}>
				{it.value}
				{#if it.note}<span class="sub">{it.note}</span>{/if}
			</dd>
		</div>
	{/each}
</dl>

<style>
	.strip {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
		flex: 1 1 auto;
	}
	.c {
		flex: 1 1 0;
		min-width: 8rem;
		padding: 0 var(--gap-grid);
		border-left: 1px solid var(--border);
	}
	.c:first-child {
		border-left: 0;
		padding-left: 0;
	}
	dt {
		color: var(--ink-3);
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
	}
	dd {
		margin: var(--space-2) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-display);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--ls-tighter);
		line-height: var(--lh-tight);
	}
	dd.up {
		color: var(--good-text);
	}
	dd.down {
		color: var(--crit-text);
	}
	/* The footnote sits inside the <dd> so it stays glued to its value, but resets the display
	   font so it reads as body copy. */
	.sub {
		display: block;
		color: var(--ink-3);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-weight: var(--fw-regular);
		letter-spacing: normal;
		margin-top: var(--space-2);
	}
	/* Stacked: the vertical rules become horizontal ones. */
	@media (max-width: 52rem) {
		.c {
			flex-basis: 100%;
			border-left: 0;
			border-top: 1px solid var(--border);
			padding: var(--gap-row) 0;
		}
		.c:first-child {
			border-top: 0;
			padding-top: 0;
		}
	}
</style>
