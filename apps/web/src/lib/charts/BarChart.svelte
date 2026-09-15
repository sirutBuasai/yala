<script lang="ts">
	// One bar chart for 1..n series: a single series renders as plain columns with value labels, two
	// or more as grouped bars with a legend. Callers pick "Bar", never "column" vs "grouped bars".
	import { scaleBand } from 'd3-scale';
	import { moneyYScale, signedYScale, plotSize } from '$lib/charts/axis';
	import { ChartBox } from '$lib/charts/box.svelte';
	import { money, moneyK, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Legend from '$lib/charts/Legend.svelte';

	interface Series {
		name: string;
		values: number[];
		color: string;
	}
	interface Props {
		labels: string[];
		series: Series[];
		/** Format the value axis, labels and tooltips as percentages instead of money. */
		percent?: boolean;
		/** A level the whole chart is judged against, drawn behind the bars. */
		reference?: { value: number; label: string };
	}
	let { labels, series, percent = false, reference }: Props = $props();

	const single = $derived(series.length <= 1);

	const box = new ChartBox();
	const W = $derived(box.w);
	const H = $derived(box.h);
	const m = { t: 22, r: 14, b: 30, l: 56 };
	const plot = $derived(plotSize(W, H, m));
	const iw = $derived(plot.iw);
	const ih = $derived(plot.ih);

	const flat = $derived(series.flatMap((s) => s.values));
	const outer = $derived(scaleBand<string>().domain(labels).range([0, iw]).padding(0.28));
	const inner = $derived(
		scaleBand<string>()
			.domain(series.map((_, j) => String(j)))
			.range([0, outer.bandwidth()])
			.padding(0.12)
	);
	// Straddling zero makes the axis's POSITION a reading — how much of the plot is deficit — so those
	// bounds are left unrounded. One-signed data keeps the rounder `nice` axis.
	const straddles = $derived(Math.min(...flat, 0) < 0 && Math.max(...flat, 0) > 0);
	const axis = $derived(straddles ? signedYScale(flat, ih) : moneyYScale(flat, ih));
	const y = $derived(axis.y);
	const ticks = $derived(axis.ticks);
	const base = $derived(y(0));

	const fmt = (v: number) => (percent ? `${Math.round(v)}%` : money(v));
	const tickFmt = (v: number) => (percent ? `${v}%` : moneyK(v));
	// A value label rides above a rising bar and below a falling one, so it never sits on the axis.
	const labelY = (v: number, yv: number) =>
		v < 0 ? Math.max(yv, base) + 14 : Math.min(yv, base) - 6;

	// An unlabelled role="img" announces only "image".
	const label = $derived(
		`Bar chart: ${series.map((sr) => sr.name).join(', ')} across ${labels.length} periods`
	);
</script>

{#if !single}
	<Legend keys={series} />
{/if}

<div class="figurebox" bind:clientWidth={box.clientWidth} bind:clientHeight={box.clientHeight}>
	<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label={label}>
		<g class="axis" transform="translate({m.l},{m.t})">
			{#each ticks as t (t)}
				<line class="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{tickFmt(t)}</text>
			{/each}
			{#if straddles}
				<line class="zero" x1={0} x2={iw} y1={base} y2={base} />
			{/if}
			{#each labels as lb, i (lb)}
				{@const gx = outer(lb) ?? 0}
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
						fill={single && v < 0 ? 'var(--role-spending)' : s.color}
						role="presentation"
						onmousemove={(e) =>
							showTip(`<b>${esc(lb)}</b><br>${single ? '' : esc(s.name) + ': '}${fmt(v)}`, e)}
						onmouseleave={hideTip}
					/>
					{#if single && v !== 0}
						<text
							class="vlabel"
							class:below={v < 0}
							x={bx + bw / 2}
							y={labelY(v, yv)}
							text-anchor="middle">{percent ? fmt(v) : moneyK(v)}</text
						>
					{/if}
				{/each}
				<text x={gx + outer.bandwidth() / 2} y={ih + 20} text-anchor="middle">{lb}</text>
			{/each}
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
	/* Zero is where the bars turn around, so it reads as an axis rather than as one more gridline. */
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
</style>
