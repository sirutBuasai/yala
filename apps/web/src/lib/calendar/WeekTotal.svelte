<script lang="ts">
	// A week's spend in the calendar's gutter: a bar grown from the bottom of its row, plus the figure.
	// Its own component because it is a mark, not a layout detail — a bar-in-a-gutter beside a row of
	// cells is the shape any "total per row" gutter wants, and the grid shouldn't own how one is drawn.
	import type { Snippet } from 'svelte';

	interface Props {
		total: number;
		/** The busiest row's total; the bar is a share of this, so the gutter reads as one chart. */
		peak: number;
		/** Spoken name — the bar and the compact figure are both hidden from assistive tech. */
		label: string;
		children: Snippet;
	}
	let { total, peak, label, children }: Props = $props();

	const pct = $derived(Math.round((total / Math.max(1, peak)) * 100));
</script>

<div class="wkcell" role="gridcell" aria-label={label}>
	<span class="wbar" aria-hidden="true"><i style:height={`${pct}%`}></i></span>
	<span class="wval" aria-hidden="true">{@render children()}</span>
</div>

<style>
	.wkcell {
		display: flex;
		align-items: stretch;
		gap: var(--gap-row);
		padding-left: var(--gap-row);
		min-width: 0;
	}
	.wbar {
		width: 7px;
		flex: none;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--inset) 65%, transparent);
		display: flex;
		align-items: flex-end;
		overflow: hidden;
	}
	.wbar i {
		display: block;
		width: 100%;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--lav) 62%, transparent);
	}
	.wval {
		align-self: center;
		font-size: var(--text-micro);
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
		white-space: nowrap;
	}
</style>
