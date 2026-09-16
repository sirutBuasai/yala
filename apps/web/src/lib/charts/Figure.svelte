<script lang="ts">
	// Bind a data primitive to a chart: ask the registry to adapt it into props, then render the matching
	// chart. Views bind data here so the data→visual coupling lives entirely in the registry.
	import type { Primitive } from '$lib/data/primitives';
	import { CHARTS_BY_ID, defaultChart, type ColorBy } from './registry';
	import Empty from '$lib/ui/Empty.svelte';

	interface Props {
		primitive: Primitive;
		/** Chart id (see registry). Defaults to the first chart accepting this kind. */
		chart?: string;
		area?: boolean;
		color?: string;
		/** What a categorical's keys name — drives their colours. */
		colorBy?: ColorBy;
		total?: number;
		/** Log-scale a line chart's value axis. */
		log?: boolean;
		/** Label lines at their right edge instead of drawing a legend. */
		endLabels?: boolean;
		/** Series names to draw dotted. */
		dashed?: string[];
		/** Print each bar's own figure above it (a lone series only). */
		valueLabels?: boolean;
		/** Heatmap scaling: per row (default) or one scale for the whole grid. */
		normalize?: 'row' | 'col' | 'global';
		/** Fix a line chart's value axis to end here, so a level partway up is not squashed to the floor. */
		ceiling?: number;
	}
	let {
		primitive,
		chart,
		area,
		color,
		colorBy,
		total,
		log,
		endLabels,
		dashed,
		valueLabels,
		normalize,
		ceiling
	}: Props = $props();

	const def = $derived(chart ? CHARTS_BY_ID[chart] : defaultChart(primitive.kind));
	const opts = $derived({
		area,
		color,
		colorBy,
		total,
		log,
		endLabels,
		dashed,
		valueLabels,
		normalize,
		ceiling
	});
	const chartProps = $derived(def ? def.adapt(primitive, opts) : null);
</script>

{#if def && chartProps}
	{@const Chart = def.component}
	<Chart {...chartProps} />
{:else}
	<Empty>No chart accepts {primitive.kind} data.</Empty>
{/if}
