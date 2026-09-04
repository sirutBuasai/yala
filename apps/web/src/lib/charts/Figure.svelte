<script lang="ts">
	// Bind a data primitive to a chart. Given a primitive (and optionally which chart and display
	// options), it asks the registry to adapt it into props and renders the matching chart. Views bind
	// data here instead of importing charts and hand-shaping props — the data→visual coupling lives
	// entirely in the registry.
	import type { Primitive } from '$lib/data/primitives';
	import { CHARTS_BY_ID, defaultChart, type ColorBy } from './registry';
	import Empty from '$lib/ui/Empty.svelte';

	interface Props {
		primitive: Primitive;
		/** Chart id (see registry). Defaults to the first chart accepting this kind. */
		chart?: string;
		area?: boolean;
		color?: string;
		/** What a categorical's keys name (categories, accounts, roles) — drives their colours. */
		colorBy?: ColorBy;
		total?: number;
		/** Log-scale a line chart's value axis. */
		log?: boolean;
		/** Label lines at their right edge instead of drawing a legend. */
		endLabels?: boolean;
		/** Series names to draw dotted — a secondary reading against a primary one. */
		dashed?: string[];
		/** Heatmap scaling: per row (default) or one scale for the whole grid. */
		normalize?: 'row' | 'global';
	}
	let { primitive, chart, area, color, colorBy, total, log, endLabels, dashed, normalize }: Props =
		$props();

	const def = $derived(chart ? CHARTS_BY_ID[chart] : defaultChart(primitive.kind));
	const opts = $derived({
		area,
		color,
		colorBy,
		total,
		log,
		endLabels,
		dashed,
		normalize
	});
	const chartProps = $derived(def ? def.adapt(primitive, opts) : null);
</script>

{#if def && chartProps}
	{@const Chart = def.component}
	<Chart {...chartProps} />
{:else}
	<Empty>No chart accepts {primitive.kind} data.</Empty>
{/if}
