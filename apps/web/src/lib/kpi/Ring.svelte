<script lang="ts">
	// A percentage as a ring. Unlike the other KPI marks this one is NOT behind the number: a ring
	// drawn behind a figure reads as a badge around it. It sits inline, immediately before the stat, at
	// the stat's own size — so it scales with the number rather than needing a size of its own.
	interface Props {
		/** 0–100. Over 100 fills the ring; `null` draws the track alone. */
		percent: number | null;
		color: string;
	}
	let { percent, color }: Props = $props();

	const R = 14;
	const CIRC = 2 * Math.PI * R;
	const filled = $derived(Math.max(0, Math.min(1, (percent ?? 0) / 100)) * CIRC);
</script>

<svg class="ring" viewBox="0 0 36 36" aria-hidden="true" style:--mark={color}>
	<!-- Started at twelve o'clock and drawn clockwise, the way a progress ring is read. -->
	<g transform="rotate(-90 18 18)">
		<circle class="track" cx="18" cy="18" r={R} />
		{#if percent !== null}
			<circle class="value" cx="18" cy="18" r={R} stroke-dasharray="{filled} {CIRC - filled}" />
		{/if}
	</g>
</svg>

<style>
	/* Sized off the STAT rather than in `em`: the ring is a SIBLING of the number, so `em` would resolve
	   against the row's font size and draw it half the height of the figure.
	   Kept to the digits' height, not the whole line box: at the full size it overhung a baseline-aligned
	   row by a pixel or two, which put the card's content permanently over its own height and had the
	   pane's resize probe refusing every attempt to narrow it. */
	.ring {
		flex: none;
		width: calc(var(--text-display) * 0.8);
		height: calc(var(--text-display) * 0.8);
	}
	.track {
		fill: none;
		stroke: var(--inset);
		stroke-width: 5;
	}
	.value {
		fill: none;
		stroke: var(--mark);
		stroke-width: 5;
		stroke-linecap: round;
	}
</style>
