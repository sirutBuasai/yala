<script lang="ts">
	// The x-labels `xAxisLabels` placed, flat or turned. A label is raised when any point it names is in
	// focus.
	import type { XAxis } from '$lib/charts/axis';

	interface Props {
		axis: XAxis;
		/** The plot's height: labels hang below it. */
		top: number;
		/** Points in focus, by position. */
		marked?: number[];
	}
	let { axis, top, marked = [] }: Props = $props();

	const y = $derived(axis.angle ? top + 12 : top + 20);
</script>

<!-- Keyed by slot, not by text: two points can share a label, and a duplicate key is fatal. -->
{#each axis.ticks as t, i (i)}
	<text
		class:focused={t.points.some((p) => marked.includes(p))}
		x={t.x}
		{y}
		text-anchor={t.anchor}
		transform={axis.angle ? `rotate(${-axis.angle} ${t.x} ${y})` : undefined}
		pointer-events="none">{t.text}</text
	>
{/each}
