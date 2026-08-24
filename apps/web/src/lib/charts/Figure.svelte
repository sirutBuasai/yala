<script lang="ts">
	// Bind a data primitive to a chart. Given a primitive (and optionally which chart
	// + layers + display options), it asks the registry to adapt it into props and
	// renders the matching chart. Views bind data here instead of importing charts and
	// hand-shaping props — the data→visual coupling lives entirely in the registry.
	import type { Primitive, Series } from '$lib/data/primitives';
	import { CHARTS_BY_ID, defaultChart } from './registry';

	interface Props {
		primitive: Primitive;
		/** Chart id (see registry). Defaults to the first chart accepting this kind. */
		chart?: string;
		/** Extra compatible series to layer on (line / grouped bars). */
		layers?: Series[];
		area?: boolean;
		legend?: boolean;
		color?: string;
		total?: number;
	}
	let { primitive, chart, layers, area, legend, color, total }: Props = $props();

	const def = $derived(chart ? CHARTS_BY_ID[chart] : defaultChart(primitive.kind));
	const opts = $derived({ layers, area, legend, color, total });
	const chartProps = $derived(def ? def.adapt(primitive, opts) : null);
</script>

{#if def && chartProps}
	{@const Chart = def.component}
	<Chart {...chartProps} />
{:else}
	<p class="empty">No chart accepts {primitive.kind} data.</p>
{/if}

<style>
	.empty {
		color: var(--ink-3);
		font-size: var(--text-secondary);
	}
</style>
