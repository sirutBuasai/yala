<script lang="ts">
	// Inline before the stat, not behind it: a ring behind a figure reads as a badge.
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
	/* Sized off the stat, not `em`, which resolves against the row. Held to the digits' height: a full line
	   box overhung the row and the resize probe refused every narrowing. */
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
