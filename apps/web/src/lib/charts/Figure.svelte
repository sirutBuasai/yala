<script lang="ts">
	// Bind a data primitive to a chart: ask the registry to adapt it into props, then render the matching
	// chart. Views bind data here so the data→visual coupling lives entirely in the registry.
	import type { Primitive } from '$lib/data/primitives';
	import { CHARTS_BY_ID, defaultChart, type ChartOptions } from './registry';
	import Empty from '$lib/ui/Empty.svelte';
	import Legible from './Legible.svelte';

	interface Props extends ChartOptions {
		primitive: Primitive;
		/** Chart id (see registry). Defaults to the first chart accepting this kind. */
		chart?: string;
		/** Makes a chart's rows (or cells) choosable, where the chart offers it: the key picked, and for a
			grid the column within it, null when a whole row was picked. */
		onpick?: (key: string, sub: string | null) => void;
		/** The key currently chosen, which the chart marks. */
		picked?: string | null;
	}
	let { primitive, chart, onpick, picked, ...opts }: Props = $props();

	const def = $derived(chart ? CHARTS_BY_ID[chart] : defaultChart(primitive.kind));
	const chartProps = $derived(def ? def.adapt(primitive, opts) : null);
</script>

{#if def && chartProps}
	{@const Chart = def.component}
	<Legible min={def.legible?.(chartProps)}>
		<Chart {...chartProps} {onpick} {picked} />
	</Legible>
{:else}
	<Empty>No chart accepts {primitive.kind} data.</Empty>
{/if}
