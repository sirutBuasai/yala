<script module lang="ts">
	/**
	 * Width one point of a chart needs before its neighbours stop being tellable apart. Sets the chart's
	 * share of the card's horizontal floor — a twelve-month bar chart asks for little, a chart over every
	 * tracked month asks for a lot.
	 */
	const CHART_PX_PER_POINT = 3;
</script>

<script lang="ts">
	// ONE KPI. A card of its own and a section of a merged card are the same thing — a single card is a
	// group of one — so this is the only component that renders a figure, and being in a group changes
	// nothing about how it is formatted.
	//
	// Reading order top to bottom: title, caption, then the stat pinned to the bottom. Bottom-pinning is
	// what puts every stat in a row on one baseline whatever its caption does.
	import type { DashboardData } from '$lib/data/types';
	import type { Scalar, Series } from '$lib/data/primitives';
	import { build } from '$lib/data/catalog';
	import { formatDelta, formatUnit } from '$lib/data/primitives';
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
	// A toned figure is one whose sign is its meaning (see `Scalar.tone`), so it shows that sign.
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

	// By NAME, from the chart registry — the one place colour is assigned, so a mark carries the same
	// hue its measure carries in a full chart. The chart is named by the SERIES it draws, which is not
	// always the figure in front of it; the ring IS the figure, so it takes the figure's name.
	const markColor = $derived(seriesColor(behind ? behind.series.name : scalar.label));

	const delta = $derived(scalar.delta);
	const deltaText = $derived(
		delta ? formatDelta(delta.value, delta.unit) + (delta.note ? ` ${delta.note}` : '') : ''
	);
</script>

<div class="kpi">
	<h2 class="serif">{title}</h2>
	<!-- Rendered even when empty: it reserves the line, so a captionless KPI still lines up with a
	     captioned neighbour inside the same card. -->
	<p class="cap" aria-hidden={caption ? undefined : 'true'}>{caption}</p>

	<div
		class="stat"
		style:--chart-min={behind ? `${behind.series.points.length * CHART_PX_PER_POINT}px` : null}
	>
		{#if behind}
			<!-- Behind the figure, running to the bottom edge of its own section. -->
			<div class="behind">
				<Spark series={behind.series} shape={behind.shape} color={markColor} />
			</div>
		{/if}
		<!-- Its own layer, so the number and the badge paint OVER the chart and are never tinted by it. -->
		<div class="front">
			{#if spec.chart === 'ring'}
				<Ring percent={scalar.value} color={markColor} />
			{/if}
			<span class="num serif" class:good={scalar.tone === 'good'} class:bad={scalar.tone === 'bad'}>
				{value}
			</span>
			{#if delta}
				<Badge tone={badgeTone(delta.tone)}>{deltaText}</Badge>
			{/if}
		</div>
	</div>
</div>

<style>
	/**
	 * The figure is set at ONE size and never reflows to fit the card, so what this card demands is the
	 * same whatever size it is. That is the property the resize probe needs: a demand that grew with the
	 * pane would let the card be dragged smaller and then refuse to come back. Past either floor the
	 * content OVERFLOWS, which the grid reads as "this pane cannot be this size", turns the pane red, and
	 * holds the drag at the last size that fitted.
	 *
	 * The horizontal floor is DECLARED, not inferred from ink. `min-content` on a flex column is the
	 * widest of its children's own minimums, so this resolves to
	 *
	 *     max(title, caption, stat + badge, chart)
	 *
	 * — every one of those being `nowrap`, or carrying `--chart-min`. That is a BOX the card cannot be
	 * narrowed past, and a box overflows its parent reliably; text ink does not. Relying on ink was the
	 * bug: a title 19px too wide for its card raised the card's own `scrollWidth` by nothing at all, so
	 * the drag sailed past it and the title clipped in silence.
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
	/* Fills the rest of the section so the number pins to the bottom, and is the box the chart scales
	   into. The chart is absolutely positioned and so demands no width of its own; `--chart-min` is how
	   it reaches the floor above, and is unset on a KPI that has no chart. */
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
	 * Scales with the card — the marks are drawn to a stretched viewBox, so each bar keeps its share of
	 * whatever height is left, and grows or shrinks with the pane.
	 *
	 * The height floor is about the height of the figure itself, deliberately not `--figure-h-floor`: that
	 * is the floor for a plot area with axes and ticks, and at 5rem it is taller than a KPI card's whole
	 * stat row, so it stopped a card with a chart from being resized at all. A bar shorter than the number in front of it
	 * is the point where one bar stops being tellable from the next, and it is also low enough that the
	 * TEXT is what stops the drag — so a card scales the same whether it carries a chart or not.
	 *
	 * Floored from the TOP so the excess overflows DOWNWARD. Scrollable overflow is measured from a box's
	 * top-left, so a chart that grew upward out of its box would be invisible to the resize probe and
	 * would silently paint over the title instead of stopping the drag.
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
		/**
		 * `normal`, not `--lh-tight`: a line-height TIGHTER than the font's own ascent-plus-descent leaves
		 * the glyph box taller than the line box, and the browser counts that difference as scrollable
		 * overflow even though every element's border box ends exactly on its parent's. The pane's resize
		 * probe reads that as content which no longer fits, so every KPI card was pinned at whatever size
		 * it had — and by how much depends on which serif actually loaded, so it reproduced on some
		 * machines and not others. `normal` derives the line box FROM the font, so the overshoot is zero
		 * whatever font wins. Visually it lands within a pixel of the token for the display face.
		 */
		line-height: normal;
		/* Never wrapped: folding onto a second line would let the card go on narrowing while the figure
		   quietly reflowed. Overflowing is what stops the drag. */
		white-space: nowrap;
	}
	/* Colour belongs to a figure whose SIGN is its meaning. A plain level stays in normal ink. */
	.num.good {
		color: var(--good-text);
	}
	.num.bad {
		color: var(--crit-text);
	}
</style>
