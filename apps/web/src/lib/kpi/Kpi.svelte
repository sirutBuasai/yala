<script lang="ts">
	// One KPI. A card of its own and a section of a merged card are the same thing, so this is the only
	// component that renders a figure.
	import type { DashboardData } from '$lib/data/types';
	import { NO_VALUE } from '$lib/copy';
	import type { Scalar, Series } from '$lib/data/primitives';
	import { build } from '$lib/data/catalog';
	import {
		CAP_DIGITS,
		capped,
		deltaLabel,
		formatDelta,
		formatUnit,
		formatUnitCompact,
		formatUnitExact,
		type DeltaDetail
	} from '$lib/data/primitives';
	import { contentFloor, levelThatFits, watchWidth } from '$lib/ui/fit';
	import { seriesColor } from '$lib/charts/registry';
	import Badge, { badgeTone } from '$lib/ui/Badge.svelte';
	import DeltaBadge from '$lib/ui/DeltaBadge.svelte';
	import LabelLine from '$lib/ui/LabelLine.svelte';
	import { DOT, labelText, type Slot } from '$lib/ui/label';
	import { tryLabels } from '$lib/layout/grid/context';
	import { kpiLabels } from './labels';
	import Spark from './Spark.svelte';
	import Ring from './Ring.svelte';
	import Meter from './Meter.svelte';
	import type { KpiSpec } from './spec';

	interface Props {
		/** Catalog-board id of this KPI, which is what a rename is stored against. Omitted off a board — in
		    the component gallery — where there is nothing to rename into. */
		id?: string;
		data: DashboardData;
		spec: KpiSpec;
		/** The board is being edited, so this KPI offers its pencils. */
		editing?: boolean;
	}
	let { id, data, spec, editing = false }: Props = $props();

	const labels = tryLabels();
	/** These labels are the user's to name, whether or not the board is being edited: it is what holds the
	    title line open in both modes, so emptying one does not move the board when the modes are switched. */
	const nameable = $derived(!!id && !!labels);
	const naming = $derived(editing && nameable);

	function rename(slot: Slot, text: string): void {
		if (id && labels) labels.set(id, slot, text);
	}

	const scalar = $derived(build(data, spec.figure, spec.scope) as Scalar);
	const declared = $derived(kpiLabels(data, spec));
	const named = $derived(
		id && labels
			? {
					title: labels.label(id, 'title', declared.title)!,
					caption: labels.label(id, 'caption', declared.caption)!
				}
			: declared
	);
	const title = $derived(labelText(named.title));
	const caption = $derived(labelText(named.caption, DOT));
	/**
	 * The figure, at a given amount of detail. `abbreviate` gives up the thousands, `digits` holds the magnitude
	 * to a ceiling; either is a fallback for a box that cannot hold the whole reading.
	 *
	 * A tone means the sign carries the meaning (see `Scalar.tone`), so the sign is shown.
	 */
	function reading({ abbreviate = false, digits = Infinity } = {}): string {
		if (scalar.value === null) return NO_VALUE;

		const v = capped(scalar.value, digits);
		if (!abbreviate) return scalar.tone ? formatDelta(v, scalar.unit) : formatUnit(v, scalar.unit);

		return (scalar.tone && v > 0 ? '+' : '') + formatUnitCompact(v, scalar.unit);
	}

	const value = $derived(reading());
	const behind = $derived(
		spec.series && spec.chart && spec.chart !== 'ring' && spec.chart !== 'meter'
			? { series: build(data, spec.series, spec.scope) as Series, shape: spec.chart }
			: null
	);
	const meter = $derived(spec.chart === 'meter' && scalar.target != null ? scalar.target : null);

	// A chart is named by the series it draws, which is not always the figure in front of it; a ring IS
	// the figure. Colour is assigned in the registry so a measure keeps one hue everywhere.
	const markColor = $derived(seriesColor(behind ? behind.series.name : labelText(scalar.label)));

	const delta = $derived(scalar.delta);
	const full = $derived(delta ? deltaLabel(delta) : '');

	/** How a rung reads: the figure, and how much of the delta rides with it. `null` drops the delta. */
	interface Rung {
		num: string;
		delta: DeltaDetail | null;
	}

	const deltaText = (detail: DeltaDetail | null) =>
		delta && detail ? deltaLabel(delta, detail) : '';

	/**
	 * What this reading may give up to fit its pane, richest first: the delta's note, then the delta's
	 * magnitude, then the figure's thousands, then the delta itself, and only last the figure's own magnitude.
	 * The figure is never dropped and the type never shrinks — a wider pane stops higher up the ladder, so every
	 * ceiling here is the pane's rather than a number written in this file.
	 */
	const LEVELS = $derived.by(() => {
		const short = reading({ abbreviate: true });
		const capping: DeltaDetail = { digits: CAP_DIGITS, note: false };
		const rungs: Rung[] = [
			{ num: value, delta: {} },
			{ num: value, delta: { note: false } },
			{ num: value, delta: capping },
			{ num: short, delta: capping },
			{ num: short, delta: null },
			{ num: reading({ abbreviate: true, digits: CAP_DIGITS }), delta: null }
		];

		const seen = new Set<string>();
		return rungs.filter((r) => {
			const k = `${r.num}|${deltaText(r.delta)}`;
			return seen.has(k) ? false : (seen.add(k), true);
		});
	});

	// Measured rather than predicted: these widths belong to the font and theme in force.
	let frontEl = $state<HTMLElement>();
	let probeEl = $state<HTMLElement>();
	let room = $state(0);
	let widths = $state<number[]>([]);
	/** Room on the line the text does not have: a ring or a meter, plus the gaps. */
	let chrome = $state(0);

	$effect(() => {
		const el = frontEl;
		if (!el) return;

		const watch = watchWidth(el, (width) => {
			room = width;
			const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
			const others = [...el.children].filter(
				(c) => !c.classList.contains('num') && !c.classList.contains('badge')
			);
			chrome =
				others.reduce((total, c) => total + c.getBoundingClientRect().width, 0) +
				Math.max(0, el.children.length - 1) * gap;
		});
		return watch.stop;
	});

	$effect(() => {
		const el = probeEl;
		if (!el) return;
		void LEVELS;
		widths = [...el.children].map((line) => line.getBoundingClientRect().width);
	});

	const shown = $derived(LEVELS[levelThatFits(widths, room, chrome)] ?? LEVELS[0]!);
	/** The reading a clamped one stands in for, for the tooltip and for a screen reader. */
	const spoken = $derived(
		[scalar.value === null ? NO_VALUE : formatUnitExact(scalar.value, scalar.unit), full]
			.filter(Boolean)
			.join(' ')
	);
	const clamped = $derived(shown.num !== value || deltaText(shown.delta) !== full);
</script>

<div
	class="kpi"
	style:--content-floor={widths.length ? contentFloor(widths[widths.length - 1]! + chrome) : null}
>
	<!-- Held open by `nameable`, not by `naming`: a line that appeared only while editing made the card
	     measure taller in one mode than the other, and the pane banked the difference. -->
	{#if title || nameable}
		<h2 class="serif" data-label-line>
			<LabelLine
				label={named.title}
				what="title"
				{nameable}
				shipped={declared.title}
				onrename={naming ? (t) => rename('title', t) : undefined}
			/>
		</h2>
	{/if}
	<!-- Rendered even when empty, so a captionless KPI lines up with a captioned neighbour, and so a caption
	     is addable before there is one to click. -->
	<p class="cap" data-label-line aria-hidden={caption || nameable ? undefined : 'true'}>
		<LabelLine
			label={named.caption}
			what="caption"
			join={DOT}
			{nameable}
			shipped={declared.caption}
			onrename={naming ? (t) => rename('caption', t) : undefined}
		/>
	</p>

	<div class="stat">
		{#if behind}
			<div class="behind">
				<Spark series={behind.series} shape={behind.shape} color={markColor} />
			</div>
		{/if}
		<!-- Its own layer, so the figure and badge paint over the chart untinted. -->
		<div class="front" bind:this={frontEl}>
			{#if spec.chart === 'ring'}
				<Ring percent={scalar.value} color={markColor} />
			{/if}
			<span
				class="num serif"
				class:good={scalar.tone === 'good'}
				class:bad={scalar.tone === 'bad'}
				title={clamped ? spoken : undefined}
				aria-label={clamped ? spoken : undefined}
			>
				{shown.num}
			</span>
			{#if delta && shown.delta}
				<DeltaBadge {delta} {...shown.delta} />
			{/if}
			{#if meter !== null}
				<Meter
					value={scalar.value}
					target={meter}
					unit={scalar.unit}
					color={markColor}
					label={title}
				/>
			{/if}
		</div>
	</div>

	<!-- Every level, laid out as the line above lays out, so the widths compared are the real ones. -->
	<div class="probe" aria-hidden="true" bind:this={probeEl}>
		{#each LEVELS as l (l.num + deltaText(l.delta))}
			<span class="line">
				<span class="num serif">{l.num}</span>
				{#if delta && l.delta}<Badge tone={badgeTone(delta.tone)}>{deltaText(l.delta)}</Badge>{/if}
			</span>
		{/each}
	</div>
</div>

<style>
	/**
	 * The floor is the TIGHTEST reading this figure can fall back to (see the levels above), not its widest:
	 * at `min-content` the card's minimum was the longest figure it might ever show, so a pane refused to be
	 * narrowed into the very sizes the clamp exists to serve. A label that would clip still refuses, but that
	 * is the probe's job (see `grid/Pane.svelte`), not this box's.
	 */
	.kpi {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-width: max(var(--content-floor, 0px), min-content);
	}
	/* One line each, and neither may be shrunk: `[data-label-line]` clips to `--label-lines`, so a host
	   that leaves it unset bounds nothing, and the column is then free to squeeze a line under its own
	   box and clip the glyphs. */
	.kpi h2,
	.cap {
		--label-lines: 1;
		flex: none;
	}
	.kpi h2 {
		white-space: nowrap;
	}
	.cap {
		min-height: calc(var(--text-secondary) * var(--lh-body));
		white-space: nowrap;
	}
	/* Pins the figure to the bottom, and is the box the chart scales into. No minimum of its own on either
	   axis: the mark is decorative and drawn at a fixed viewBox that its box scales (see `Spark`), so a floor
	   here would be a data-dependent one — a series with more points would refuse a resize a shorter series
	   allowed. */
	.stat {
		position: relative;
		flex: 1 1 auto;
		display: flex;
		align-items: flex-end;
		margin-top: auto;
		padding-top: var(--space-4);
		min-width: 0;
	}
	.behind {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
	}
	/**
	 * Spans the stat's width, so an inline mark asking for the leftover space (see `Meter`) has some. `hidden`,
	 * so the figure can never spill the card: the clamp is what keeps it readable.
	 *
	 * `contain: inline-size` keeps the figure out of the card's own min-content, which is what the LABELS are
	 * measured by — a rename grows the pane, and the widest figure standing in that number made the card
	 * refuse the narrow sizes the clamp exists for. The figure's floor is `--content-floor` instead.
	 */
	.front {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: baseline;
		gap: var(--gap-row);
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		contain: inline-size;
	}
	/* Arranging covers the card with a drag surface, but this layer is z-indexed above it and nothing in
	   here is interactive, so a press on the figure landed on nothing and the card would not drag. */
	:global(.board.arranging) .front {
		pointer-events: none;
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
	/* Laid out but unpainted: `display: none` measures nothing. Zero-sized and clipped because an absolutely
	   positioned descendant still counts towards an ancestor's SCROLLABLE overflow — sized, the probe read as
	   content spilling the card and every KPI pane refused to be resized. */
	.probe {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		overflow: hidden;
		visibility: hidden;
		pointer-events: none;
	}
	/* The same axis, gap and nowrap as `.front`, since that is the line being measured for. `max-content`
	   because the box above gives it no width to lay out in. */
	.probe .line {
		display: flex;
		width: max-content;
		align-items: baseline;
		gap: var(--gap-row);
		white-space: nowrap;
	}
</style>
