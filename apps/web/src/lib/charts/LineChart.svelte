<script lang="ts">
	import { line, area } from 'd3-shape';
	import {
		focusPad,
		moneyYScale,
		logYScale,
		pickGroups,
		plotSize,
		xAxisLabels
	} from '$lib/charts/axis';
	import { ChartBox } from '$lib/charts/box.svelte';
	import { esc } from '$lib/utils/format';
	import { chartFormat } from '$lib/charts/format';
	import { type Unit } from '$lib/data/primitives';
	import { clamp } from '$lib/utils/num';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Legend from '$lib/charts/Legend.svelte';
	import { chartLabel } from '$lib/charts/aria';
	import { declutter } from '$lib/charts/declutter';
	import FocusBand from '$lib/charts/marks/FocusBand.svelte';
	import XLabels from '$lib/charts/marks/XLabels.svelte';
	import PickBands from '$lib/charts/marks/PickBands.svelte';

	interface Series {
		name: string;
		values: (number | null)[];
		color: string;
		area?: boolean;
		/** Render as a dotted line — a secondary reading against a primary one. */
		dashed?: boolean;
	}
	interface Props {
		labels: string[];
		/** Each point's hover heading after its label; see `MultiSeries.notes`. */
		notes?: string[];
		series: Series[];
		/** A range shaded behind the lines, in the colour of the series it belongs to; see `MultiSeries.band`. */
		band?: { name: string; lo: number[]; hi: number[]; color: string };
		/** The unit every series is read in, which decides how the axis, labels and tooltips word it. */
		unit: Unit;
		/** Log-scale the value axis — for series spanning orders of magnitude. */
		log?: boolean;
		/** Label each line at its right end instead of using a legend. */
		endLabels?: boolean;
		/** Fix the value axis to end here, for a chart whose point is a level partway up. Lines past it flatten;
		    tooltips still state the true figure. */
		ceiling?: number;
		/** The points of the period in focus, shaded behind the lines. */
		marked?: number[];
		/** Each point's period key, which lets a crowded axis spanning years name each year once. */
		periods?: string[];
		/** The period each point picks (`pickKeys`); with `onpick`, a click picks the run a point is in. */
		picks?: string[];
		onpick?: (key: string) => void;
		picked?: string | null;
	}
	let {
		labels,
		notes,
		series,
		band,
		unit,
		log = false,
		endLabels = false,
		ceiling,
		marked = [],
		periods,
		picks,
		onpick,
		picked
	}: Props = $props();

	/** What is drawn: the readings, held to the ceiling. Everything the reader is TOLD comes off `series`,
	    so the frame narrows the view without misreporting a figure. */
	const plotted = $derived(
		ceiling == null
			? series
			: series.map((s) => ({
					...s,
					values: s.values.map((v) => (v == null ? v : Math.min(v, ceiling)))
				}))
	);

	const bandFill = $derived(band && `color-mix(in srgb, ${band.color} 25%, transparent)`);
	/** Held to the ceiling as the lines are. */
	const bandPlotted = $derived(
		band && {
			lo: band.lo.map((v) => (ceiling == null ? v : Math.min(v, ceiling))),
			hi: band.hi.map((v) => (ceiling == null ? v : Math.min(v, ceiling)))
		}
	);
	const keys = $derived(band ? [...series, { name: band.name, color: bandFill! }] : series);

	const showLegend = $derived(!endLabels && keys.length > 1);

	const box = new ChartBox();
	const W = $derived(box.w);
	const H = $derived(box.h);
	// A share of the box, not a constant, so a narrow card doesn't hand most of its plot to labels.
	const side = $derived({ t: 16, r: endLabels ? clamp(W * 0.2, 96, 170) : 16, l: 60 });
	// The bottom margin is whatever the x-labels need, so the width is found without it.
	const iw = $derived(Math.max(0, W - side.l - side.r));
	const n = $derived(labels.length);
	const xs = $derived(labels.map((_, i) => xPos(i)));
	const xAxis = $derived(xAxisLabels(xs, labels, periods, true));
	const m = $derived({ ...side, b: xAxis.bottom });
	const ih = $derived(plotSize(W, H, m).ih);
	// Unique per instance, so two area charts on one page can't share a gradient.
	const gid = 'lg-' + Math.random().toString(36).slice(2, 9);

	const flat = $derived(
		[...plotted.flatMap((s) => s.values), ...(bandPlotted?.hi ?? [])].filter(
			(v): v is number => v != null
		)
	);
	const axis = $derived(log ? logYScale(flat, ih) : moneyYScale(flat, ih, ceiling));
	const y = $derived(axis.y);
	const ticks = $derived(axis.ticks);
	const xPos = (i: number) => (n > 1 ? (iw * i) / (n - 1) : iw / 2);
	// A log axis can't place zero or negatives, so those points break the line instead.
	const plottable = (v: number | null): v is number => v != null && (!log || v > 0);

	const f = $derived(chartFormat(unit, ticks));
	// An end label has the gutter to print the figure in full; the hover carries the cents it rounds away.
	const fmt = (v: number) => f.plain(v);

	const paths = $derived(
		plotted.map((s) => {
			const lineGen = line<number | null>()
				.defined(plottable)
				.x((_, i) => xPos(i))
				.y((v) => y(v as number));
			const areaGen = area<number | null>()
				.defined(plottable)
				.x((_, i) => xPos(i))
				.y0(y(log ? ticks[0]! : 0))
				.y1((v) => y(v as number));
			return { line: lineGen(s.values) ?? '', area: s.area ? (areaGen(s.values) ?? '') : '' };
		})
	);

	/** Right-edge labels are a line apart at least, and stay on the plot. */
	const GAP = 14;
	const ends = $derived.by(() => {
		if (!endLabels) return [];
		const list = plotted
			.map((s) => {
				const last = [...s.values].reverse().findIndex(plottable);
				const i = last < 0 ? -1 : n - 1 - last;
				return i < 0 ? null : { name: s.name, color: s.color, value: s.values[i] as number, i };
			})
			.filter((e): e is NonNullable<typeof e> => e !== null)
			.map((e) => ({ ...e, y0: y(e.value) }));
		const at = declutter(
			list.map((e) => e.y0),
			GAP,
			0,
			ih
		);
		return list.map((e, i) => ({ ...e, y: at[i]! }));
	});

	const bandPath = $derived(
		bandPlotted
			? (area<number>()
					.x((_, i) => xPos(i))
					.y0((_, i) => y(bandPlotted.lo[i]!))
					.y1((v) => y(v))(bandPlotted.hi) ?? '')
			: ''
	);

	const label = $derived(
		chartLabel(
			'Line chart',
			series.map((sr) => sr.name),
			labels.length ? ` from ${labels[0]} to ${labels[labels.length - 1]}` : ''
		)
	);

	let hover = $state<number | null>(null);

	const pickable = $derived(!!onpick && !!picks);
	const groups = $derived(pickable ? pickGroups(xs, picks!, iw) : []);
	/** How far a pick reaches below the plot, so a click on a point's axis label picks it too. */
	const LABEL_REACH = 26;

	const markWidth = $derived(focusPad(n, iw));

	function onMove(e: MouseEvent) {
		const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		let i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
		i = Math.max(0, Math.min(n - 1, i));
		hover = i;
		const lines = series
			.filter((s) => s.values[i] != null)
			// Largest first, so a many-line tooltip reads top-down by magnitude.
			.sort((a, b) => (b.values[i] as number) - (a.values[i] as number))
			.map((s) => `${esc(s.name)}: ${f.exact(s.values[i] as number)}`)
			.join('<br>');
		const range = band
			? `<br>${esc(band.name)}: ${f.exact(band.lo[i]!)}—${f.exact(band.hi[i]!)}`
			: '';
		const note = notes?.[i] ? ` · ${esc(notes[i])}` : '';
		showTip(`<b>${esc(labels[i])}</b>${note}<br>${lines}${range}`, e);
	}
	function onLeave() {
		hover = null;
		hideTip();
	}
</script>

{#if showLegend}
	<!-- Dashed series are keyed too: a dashed line is a real second reading, and omitting it left
	     neither line identifiable. -->
	<Legend {keys} />
{/if}

<div class="figurebox" bind:clientWidth={box.clientWidth} bind:clientHeight={box.clientHeight}>
	<svg class="chart" viewBox="0 0 {W} {H}" role={pickable ? 'group' : 'img'} aria-label={label}>
		<defs>
			{#each series as s, si (s.name)}
				{#if s.area}
					<linearGradient id="{gid}-{si}" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color={s.color} stop-opacity="var(--mark-area)" />
						<stop offset="100%" stop-color={s.color} stop-opacity="0" />
					</linearGradient>
				{/if}
			{/each}
		</defs>
		<g class="axis" transform="translate({m.l},{m.t})">
			{#each ticks as t (t)}
				<line class="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{f.tick(t)}</text>
			{/each}

			{#if pickable}
				<PickBands
					{groups}
					hovered={hover === null ? null : picks![hover]!}
					{picked}
					onpick={onpick!}
					height={ih + LABEL_REACH}
				/>
			{/if}
			<FocusBand xs={marked.map(xPos)} pad={markWidth} height={ih + 26} />

			{#if bandPath}
				<path d={bandPath} fill={bandFill} />
			{/if}

			{#each plotted as s, si (s.name)}
				{@const pth = paths[si]!}
				{#if s.area}
					<path d={pth.area} fill="url(#{gid}-{si})" />
				{/if}
				<path
					d={pth.line}
					fill="none"
					stroke={s.color}
					stroke-width="2"
					stroke-linejoin="round"
					stroke-dasharray={s.dashed ? '5 5' : undefined}
					opacity={s.dashed ? 0.85 : 1}
				/>
			{/each}

			<XLabels axis={xAxis} top={ih} {marked} />

			{#each ends as e (e.name)}
				<circle cx={xPos(e.i)} cy={e.y0} r="3" fill={e.color} />
				<path
					d={`M${xPos(e.i) + 5},${e.y0} L${iw + 12},${e.y}`}
					stroke={e.color}
					stroke-width="1"
					opacity="0.4"
					fill="none"
				/>
				<text class="endlab" x={iw + 17} y={e.y + 3.5}
					>{e.name}<tspan class="endval" dx="6">{fmt(e.value)}</tspan></text
				>
			{/each}

			{#if hover !== null}
				<line
					class="gridline"
					x1={xPos(hover)}
					x2={xPos(hover)}
					y1={0}
					y2={ih}
					stroke="var(--ink-3)"
					stroke-dasharray="3 3"
				/>
				{#each plotted as s (s.name)}
					{#if s.values[hover] != null}
						<circle
							cx={xPos(hover)}
							cy={y(s.values[hover] as number)}
							r="5"
							fill="var(--surface)"
							stroke={s.color}
							stroke-width="2"
						/>
					{/if}
				{/each}
			{/if}

			<rect
				x={0}
				y={0}
				width={iw}
				height={pickable ? ih + LABEL_REACH : ih}
				fill="transparent"
				class:pick={pickable}
				role="presentation"
				onmousemove={onMove}
				onmouseleave={onLeave}
				onclick={pickable ? () => hover !== null && onpick!(picks![hover]!) : undefined}
			/>
		</g>
	</svg>
</div>

<style>
	.pick {
		cursor: pointer;
	}
</style>
