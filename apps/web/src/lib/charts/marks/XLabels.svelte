<script lang="ts">
	// Every x-label under a plot, flat or turned as `xLabelLayout` decides, so none is dropped and none
	// overlaps another.
	import { labelAnchor, type XLabelLayout } from '$lib/charts/axis';

	interface Props {
		labels: string[];
		/** Each label's x, in plot coordinates. */
		xs: number[];
		/** The plot's height: labels hang below it. */
		top: number;
		layout: XLabelLayout;
		/** For a continuous axis, whose end labels anchor inward. */
		anchored?: boolean;
		/** Label positions to raise, for the period in focus. */
		focused?: (i: number) => boolean;
	}
	let { labels, xs, top, layout, anchored = false, focused = () => false }: Props = $props();

	const anchorOf = (i: number) =>
		layout.angle ? 'end' : anchored ? labelAnchor(i, labels.length) : 'middle';
</script>

<!-- Keyed by slot, not by text: two points can share a label, and a duplicate key is fatal. -->
{#each labels as lb, i (i)}
	{@const x = xs[i] ?? 0}
	{@const y = layout.angle ? top + 12 : top + 20}
	<text
		class:focused={focused(i)}
		{x}
		{y}
		text-anchor={anchorOf(i)}
		transform={layout.angle ? `rotate(${-layout.angle} ${x} ${y})` : undefined}
		pointer-events="none">{lb}</text
	>
{/each}
