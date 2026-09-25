<script lang="ts">
	// The period in focus on a continuous axis: one band behind every point it covers, reaching under the
	// axis labels so the raised label sits inside it.
	interface Props {
		/** The covered points, as x positions in order. */
		xs: number[];
		/** How far the band reaches past the outermost points, in total. */
		pad: number;
		height: number;
	}
	let { xs, pad, height }: Props = $props();

	const from = $derived(xs[0]);
	const to = $derived(xs.at(-1));
</script>

{#if from != null && to != null}
	<rect class="focusband" x={from - pad / 2} y={0} width={to - from + pad} {height} rx="6" />
{/if}
