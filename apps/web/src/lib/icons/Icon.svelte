<script module lang="ts">
	/** Design units every icon is drawn in, so one `size` scales the lot. */
	const BOX = 16;
</script>

<script lang="ts">
	// The frame every icon shares: a square box at the caller's size, and the stroke presentation as CSS so an
	// icon is only its path data. `fill` and `stroke` inherit, and a child that states its own still wins — a
	// filled detail inside a stroked icon needs no exception here.
	import type { Snippet } from 'svelte';

	interface Props {
		size?: number;
		/** Stroke width in design units. */
		weight?: number;
		/** The shape is a fill rather than a stroke. */
		filled?: boolean;
		children: Snippet;
	}
	let { size = 14, weight = 1.6, filled = false, children }: Props = $props();
</script>

<svg
	class="icon"
	class:filled
	width={size}
	height={size}
	viewBox="0 0 {BOX} {BOX}"
	aria-hidden="true"
	style:--icon-weight={weight}
>
	{@render children()}
</svg>

<style>
	.icon {
		fill: none;
		stroke: currentColor;
		stroke-width: var(--icon-weight);
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.icon.filled {
		fill: currentColor;
		stroke: none;
	}
</style>
