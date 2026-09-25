<script lang="ts">
	// A week's spend in the calendar's gutter: a bar grown from the bottom of its row, plus the figure.
	import type { Snippet } from 'svelte';
	import Bands from '$lib/charts/marks/Bands.svelte';

	interface Props {
		total: number;
		/** The busiest row's total; each bar is a share of it, so the gutter reads as one chart. */
		peak: number;
		/** Spoken name; the bar and the figure are hidden from assistive tech. */
		label: string;
		children: Snippet;
	}
	let { total, peak, label, children }: Props = $props();

	const pct = $derived(Math.round((total / Math.max(1, peak)) * 100));
</script>

<div class="wkcell" role="gridcell" aria-label={label}>
	<span class="wbar" aria-hidden="true">
		<Bands
			axis="y"
			radius={3.5}
			bands={[
				{ from: 0, to: 100, fill: 'color-mix(in srgb, var(--inset) 65%, transparent)' },
				{ from: 0, to: pct, fill: 'color-mix(in srgb, var(--lav) 62%, transparent)' }
			]}
		/>
	</span>
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
	}
	.wval {
		align-self: center;
		font-size: var(--text-micro);
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
		white-space: nowrap;
	}
</style>
