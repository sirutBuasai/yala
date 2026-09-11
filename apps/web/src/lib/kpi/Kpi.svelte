<script module lang="ts">
	/** Width one point of a chart needs before its neighbours stop being tellable apart. */
	const CHART_PX_PER_POINT = 3;
</script>

<script lang="ts">
	// One KPI. A card of its own and a section of a merged card are the same thing, so this is the only
	// component that renders a figure.
	import type { DashboardData } from '$lib/data/types';
	import type { Scalar, Series } from '$lib/data/primitives';
	import { build } from '$lib/data/catalog';
	import { deltaLabel, formatDelta, formatUnit } from '$lib/data/primitives';
	import { seriesColor } from '$lib/charts/registry';
	import Badge, { badgeTone } from '$lib/ui/Badge.svelte';
	import Spark from './Spark.svelte';
	import Ring from './Ring.svelte';
	import type { KpiSpec } from './spec';

	interface Props {
		data: DashboardData;
		spec: KpiSpec;
	}
	let { data, spec }: Props = $props();

	const scalar = $derived(build(data, spec.figure, spec.scope) as Scalar);
	const title = $derived(spec.title ?? scalar.label);
	const caption = $derived(spec.caption ?? scalar.note ?? '');
	// A tone means the sign carries the meaning (see `Scalar.tone`), so the sign is shown.
	const value = $derived(
		scalar.value === null
			? '—'
			: scalar.tone
				? formatDelta(scalar.value, scalar.unit)
				: formatUnit(scalar.value, scalar.unit)
	);
	const behind = $derived(
		spec.series && spec.chart && spec.chart !== 'ring'
			? { series: build(data, spec.series, spec.scope) as Series, shape: spec.chart }
			: null
	);

	// A chart is named by the series it draws, which is not always the figure in front of it; a ring IS
	// the figure. Colour is assigned in the registry so a measure keeps one hue everywhere.
	const markColor = $derived(seriesColor(behind ? behind.series.name : scalar.label));

	const delta = $derived(scalar.delta);
</script>

<div class="kpi">
	<h2 class="serif">{title}</h2>
	<!-- Rendered even when empty, so a captionless KPI lines up with a captioned neighbour. -->
	<p class="cap" aria-hidden={caption ? undefined : 'true'}>{caption}</p>

	<div
		class="stat"
		style:--chart-min={behind ? `${behind.series.points.length * CHART_PX_PER_POINT}px` : null}
	>
		{#if behind}
			<div class="behind">
				<Spark series={behind.series} shape={behind.shape} color={markColor} />
			</div>
		{/if}
		<!-- Its own layer, so the figure and badge paint over the chart untinted. -->
		<div class="front">
			{#if spec.chart === 'ring'}
				<Ring percent={scalar.value} color={markColor} />
			{/if}
			<span class="num serif" class:good={scalar.tone === 'good'} class:bad={scalar.tone === 'bad'}>
				{value}
			</span>
			{#if delta}
				<Badge tone={badgeTone(delta.tone)}>{deltaLabel(delta)}</Badge>
			{/if}
		</div>
	</div>
</div>

<style>
	/**
	 * Nothing here reflows, so the demand is the same at every size and the resize probe can treat it as a
	 * floor. `min-content` must resolve to a BOX, not text ink: ink overflowing a box the card doesn't
	 * scroll never reaches the card's scroll width, so a drag sailed past it and the title clipped.
	 */
	.kpi {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-width: min-content;
	}
	.kpi h2 {
		white-space: nowrap;
	}
	.cap {
		min-height: calc(var(--text-secondary) * var(--lh-body));
		white-space: nowrap;
	}
	/* Pins the figure to the bottom, and is the box the chart scales into. The chart is positioned out of
	   flow and demands no width of its own, so `--chart-min` is how it reaches the floor above. */
	.stat {
		position: relative;
		flex: 1 1 auto;
		display: flex;
		align-items: flex-end;
		margin-top: auto;
		padding-top: var(--space-4);
		min-width: var(--chart-min, 0);
	}
	/**
	 * Floored at the figure's own height, NOT `--figure-h-floor`, which is sized for a plot area with axes
	 * and exceeds a whole stat row — with it, a card carrying a chart would not resize at all. Floored from
	 * the TOP so the excess overflows downward: scrollable overflow is measured from a box's top-left, so a
	 * chart growing upward would be invisible to the probe and would paint over the title.
	 */
	.behind {
		position: absolute;
		inset: 0 0 auto 0;
		height: 100%;
		min-height: calc(var(--text-display) * var(--lh-tight));
		z-index: 0;
		pointer-events: none;
	}
	.front {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: baseline;
		gap: var(--gap-row);
	}
	.num {
		font-size: var(--text-display);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--ls-tighter);
		/* `normal`, not `--lh-tight`: a line-height tighter than the font's own ascent-plus-descent leaves
		   the glyphs overflowing the line box, which the resize probe reads as content that no longer fits
		   and which pinned every card. Deriving the box from the font makes the overshoot zero for any
		   font, so this must not go back to a fixed ratio. */
		line-height: normal;
		/* Wrapping would let the card narrow while the figure quietly reflowed. */
		white-space: nowrap;
	}
	.num.good {
		color: var(--good-text);
	}
	.num.bad {
		color: var(--crit-text);
	}
</style>
