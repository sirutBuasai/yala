<script lang="ts">
	// One bar chart for 1..n series: one renders as plain columns with value labels, more as grouped bars
	// with a legend. Callers pick "Bar", never "column" vs "grouped bars".
	import { scaleBand } from 'd3-scale';
	import {
		halfLabelWidth,
		moneyYScale,
		signedYScale,
		plotSize,
		xAxisLabels
	} from '$lib/charts/axis';
	import XLabels from '$lib/charts/marks/XLabels.svelte';
	import { clamp } from '$lib/utils/num';
	import { ChartBox } from '$lib/charts/box.svelte';
	import { esc } from '$lib/utils/format';
	import { chartFormat } from '$lib/charts/format';
	import { showTip, hideTip, withAlt } from '$lib/utils/tooltip';
	import Legend from '$lib/charts/Legend.svelte';
	import { chartLabel, onPress } from '$lib/charts/aria';
	import { type Unit } from '$lib/data/primitives';

	interface Series {
		name: string;
		values: number[];
		color: string;
		/** The same values in `altUnit`, reported beside them in a tooltip. */
		alt?: (number | null)[];
	}
	interface Props {
		labels: string[];
		series: Series[];
		/** The unit every series is read in, which decides how the axis, labels and tooltips word it. */
		unit: Unit;
		altUnit?: Unit;
		/** Print each bar's own figure above it. Only a lone series can carry them — over several they
		    collide — and off by default, since the hover already gives the exact number. */
		valueLabels?: boolean;
		/** A level the whole chart is judged against, drawn behind the bars. */
		reference?: { value: number; label: string };
		/** Makes each period's group of bars choosable, by its label. A group with nothing in it is not. */
		onpick?: (label: string) => void;
		/** The label currently chosen: its group is shaded and the rest recede. */
		picked?: string | null;
	}
	let {
		labels,
		series,
		unit,
		altUnit,
		valueLabels = false,
		reference,
		onpick,
		picked
	}: Props = $props();

	const pickable = (i: number) => !!onpick && series.some((s) => (s.values[i] ?? 0) !== 0);
	const receded = (lb: string) => picked != null && lb !== picked;

	const single = $derived(series.length <= 1);

	const box = new ChartBox();
	const W = $derived(box.w);
	const H = $derived(box.h);
	const side = { t: 22, r: 14, l: 56 };
	// The bottom margin is whatever the x-labels need, so the width is found without it.
	const iw = $derived(Math.max(0, W - side.l - side.r));

	const flat = $derived(series.flatMap((s) => s.values));
	const outer = $derived(scaleBand<string>().domain(labels).range([0, iw]).padding(0.28));
	const inner = $derived(
		scaleBand<string>()
			.domain(series.map((_, j) => String(j)))
			.range([0, outer.bandwidth()])
			.padding(0.12)
	);
	const xs = $derived(labels.map((lb) => (outer(lb) ?? 0) + outer.bandwidth() / 2));
	const xAxis = $derived(xAxisLabels(xs, labels, undefined, false));
	const m = $derived({ ...side, b: xAxis.bottom + 2 });
	const ih = $derived(plotSize(W, H, m).ih);
	// Straddling zero makes the axis's position a reading, so those bounds are left unrounded; one-signed
	// data keeps the rounder `nice` axis.
	const straddles = $derived(Math.min(...flat, 0) < 0 && Math.max(...flat, 0) > 0);
	const axis = $derived(straddles ? signedYScale(flat, ih) : moneyYScale(flat, ih));
	const y = $derived(axis.y);
	const ticks = $derived(axis.ticks);
	const base = $derived(y(0));

	const f = $derived(chartFormat(unit, ticks));
	// A bar label abbreviates but stays exact below a thousand: on a chart whose bars span both sides of
	// one, abbreviating a bar of tens leaves nothing readable.
	const fmt = (v: number) => f.compact(v);

	const tipValue = (s: Series, i: number) => withAlt(f.exact(s.values[i]!), s.alt?.[i], altUnit);
	// Above a rising bar and below a falling one, so a label never sits on the axis.
	const labelY = (v: number, yv: number) =>
		v < 0 ? Math.max(yv, base) + 14 : Math.min(yv, base) - 6;

	/** Centred on its bar, but held inside the plot at the ends: `svg.chart` does not clip, and a chart's
	    side margins are narrower than half a figure, so a wide one on an edge bar paints outside the card. */
	const labelX = (cx: number, text: string) => {
		const half = halfLabelWidth(text);
		return clamp(cx, half, Math.max(half, iw - half));
	};

	/** Every bar's figure or none: printed over a run of narrow bars they ran into each other. */
	const showValues = $derived.by(() => {
		const s = series[0];
		if (!valueLabels || !single || !s) return false;
		const spans = labels
			.map((lb, i) => {
				const v = s.values[i] ?? 0;
				if (v === 0) return null;
				const text = fmt(v);
				const half = halfLabelWidth(text);
				const cx = labelX((outer(lb) ?? 0) + (inner('0') ?? 0) + inner.bandwidth() / 2, text);
				return [cx - half, cx + half] as const;
			})
			.filter((sp) => sp !== null);
		return spans.every((sp, i) => i === 0 || spans[i - 1]![1] < sp[0]);
	});

	const label = $derived(
		chartLabel(
			'Bar chart',
			series.map((sr) => sr.name),
			` across ${labels.length} periods`
		)
	);
</script>

{#if !single}
	<Legend keys={series} />
{/if}

<div class="figurebox" bind:clientWidth={box.clientWidth} bind:clientHeight={box.clientHeight}>
	<!-- A group, not an image, once its bars are buttons: an image's children are hidden from assistive
	     tech. -->
	<svg class="chart" viewBox="0 0 {W} {H}" role={onpick ? 'group' : 'img'} aria-label={label}>
		<g class="axis" transform="translate({m.l},{m.t})">
			{#each ticks as t (t)}
				<line class="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{f.tick(t)}</text>
			{/each}
			{#if straddles}
				<line class="zero" x1={0} x2={iw} y1={base} y2={base} />
			{/if}
			<!-- Keyed by slot, not by text: two bands can share a label, and a duplicate key is fatal. -->
			{#each labels as lb, i (i)}
				{@const gx = outer(lb) ?? 0}
				{@const pad = (outer.step() - outer.bandwidth()) / 2}
				<g class="period">
					{#if pickable(i)}
						<rect
							class="band"
							class:focusband={lb === picked}
							x={gx - pad}
							y={0}
							width={outer.step()}
							height={ih + 26}
							rx="6"
							role="button"
							tabindex="0"
							aria-label={lb}
							aria-pressed={lb === picked}
							onclick={() => onpick?.(lb)}
							onkeydown={(e) => onPress(e, () => onpick?.(lb))}
						/>
					{/if}
					{#each series as s, j (s.name)}
						{@const v = s.values[i]!}
						{@const yv = y(v)}
						{@const bx = gx + (inner(String(j)) ?? 0)}
						{@const bw = inner.bandwidth()}
						<rect
							x={bx}
							y={Math.min(yv, base)}
							width={bw}
							height={Math.abs(yv - base)}
							rx="3"
							fill={s.color}
							class:receded={receded(lb)}
							class:pickthrough={pickable(i)}
							role="presentation"
							onclick={pickable(i) ? () => onpick?.(lb) : undefined}
							onmousemove={(e) =>
								showTip(
									`<b>${esc(lb)}</b><br>${single ? '' : esc(s.name) + ': '}${tipValue(s, i)}`,
									e
								)}
							onmouseleave={hideTip}
						/>
						{#if showValues && v !== 0}
							<text
								class="vlabel"
								class:below={v < 0}
								x={labelX(bx + bw / 2, fmt(v))}
								y={labelY(v, yv)}
								text-anchor="middle">{fmt(v)}</text
							>
						{/if}
					{/each}
				</g>
			{/each}
			<XLabels axis={xAxis} top={ih} marked={picked == null ? [] : [labels.indexOf(picked)]} />
			{#if reference}
				<line class="reference" x1={0} x2={iw} y1={y(reference.value)} y2={y(reference.value)} />
				<text class="rlabel" x={0} y={y(reference.value) - 5} text-anchor="start">
					{fmt(reference.value)}
					{reference.label}
				</text>
			{/if}
		</g>
	</svg>
</div>

<style>
	/* Zero is where the bars turn around, so it reads as an axis rather than one more gridline. */
	.zero {
		stroke: var(--ink-3);
		stroke-width: 1;
	}
	.reference {
		stroke: var(--ink-3);
		stroke-width: 1;
		stroke-dasharray: 4 3;
	}
	.rlabel {
		fill: var(--ink-3);
		font-size: var(--text-micro);
		font-variant-numeric: tabular-nums;
	}
	.vlabel.below {
		fill: var(--crit-text);
	}
	/* The whole period is the target, bars and gaps alike, so a short bar is as easy to hit as a tall one. */
	.band {
		cursor: pointer;
		outline: none;
	}
	.band:not(.focusband) {
		fill: transparent;
	}
	.period:hover .band,
	.band:focus-visible {
		fill: var(--inset);
	}
	.band:focus-visible {
		stroke: var(--ring-color);
		stroke-width: var(--ring-width);
	}
	.pickthrough {
		cursor: pointer;
	}
	.receded {
		opacity: 0.4;
	}
</style>
