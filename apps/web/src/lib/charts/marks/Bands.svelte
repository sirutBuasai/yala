<script module lang="ts">
	/** A stretch of the box along its axis, as percentages of it: a bar, a track, a range. */
	export interface Band {
		from: number;
		to: number;
		fill: string;
		/** Share of the box across the axis, centred. The whole of it by default. */
		thickness?: number;
	}
</script>

<script lang="ts">
	// Bars drawn as SVG rectangles filling the box they sit in, so every bar, track and range is a shape
	// rather than a styled element. The box sizes it; this only divides it.
	interface Props {
		bands: Band[];
		axis?: 'x' | 'y';
		/** Corner radius in px. */
		radius?: number;
	}
	let { bands, axis = 'x', radius = 0 }: Props = $props();

	const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
</script>

<svg class="bands" width="100%" height="100%" aria-hidden="true">
	{#each bands as b, i (i)}
		{@const across = b.thickness ?? 1}
		{@const lo = Math.min(b.from, b.to)}
		{@const hi = Math.max(b.from, b.to)}
		{#if axis === 'x'}
			<rect
				x={pct(lo)}
				width={pct(hi - lo)}
				y={pct(((1 - across) / 2) * 100)}
				height={pct(across * 100)}
				rx={radius}
				style:fill={b.fill}
			/>
		{:else}
			<rect
				y={pct(100 - hi)}
				height={pct(hi - lo)}
				x={pct(((1 - across) / 2) * 100)}
				width={pct(across * 100)}
				rx={radius}
				style:fill={b.fill}
			/>
		{/if}
	{/each}
</svg>

<style>
	/* Sized by its box alone. Without `contain`, a box with no height of its own resolved `100%` to the
	   150px an SVG defaults to: a progress track sat at its ceiling and held its pane's floor up. */
	.bands {
		display: block;
		overflow: visible;
		contain: size;
	}
</style>
