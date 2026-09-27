<script module lang="ts">
	/** Design units every icon is drawn in, so one `size` scales the lot. */
	const BOX = 16;
</script>

<script lang="ts">
	// A square box at the caller's size, with stroke presentation in CSS so an icon is only its path data.
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
