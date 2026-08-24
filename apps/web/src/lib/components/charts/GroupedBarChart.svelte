<script lang="ts">
	import { scaleBand } from 'd3-scale';
	import { moneyYScale } from '$lib/charts/axis';
	import { money, moneyK, esc } from '$lib/format';
	import { showTip, hideTip } from '$lib/tooltip';

	interface Series {
		name: string;
		values: number[];
		color: string;
	}
	interface Props {
		labels: string[];
		series: Series[];
		legend?: boolean;
	}
	let { labels, series, legend = true }: Props = $props();

	// Render at the measured pixel size so the chart fills (and grows with) its pane.
	let boxW = $state(0);
	let boxH = $state(0);
	const W = $derived(boxW || 1100);
	const H = $derived(boxH || 300);
	const m = { t: 16, r: 14, b: 30, l: 56 };
	const iw = $derived(W - m.l - m.r);
	const ih = $derived(H - m.t - m.b);

	const flat = $derived(series.flatMap((s) => s.values));
	const outer = $derived(scaleBand<string>().domain(labels).range([0, iw]).padding(0.28));
	const inner = $derived(
		scaleBand<string>()
			.domain(series.map((_, j) => String(j)))
			.range([0, outer.bandwidth()])
			.padding(0.12)
	);
	const axis = $derived(moneyYScale(flat, ih));
	const y = $derived(axis.y);
	const ticks = $derived(axis.ticks);
	const base = $derived(y(0));
</script>

{#if legend}
	<div class="legend">
		{#each series as s (s.name)}
			<span class="k"><span class="sw" style:background={s.color}></span>{s.name}</span>
		{/each}
	</div>
{/if}

<div class="chartbox" bind:clientWidth={boxW} bind:clientHeight={boxH}>
	<svg class="chart" viewBox="0 0 {W} {H}" role="img">
		<g class="axis" transform="translate({m.l},{m.t})">
			{#each ticks as t (t)}
				<line class="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{moneyK(t)}</text>
			{/each}
			{#each labels as lb, i (lb)}
				{@const gx = outer(lb) ?? 0}
				{#each series as s, j (s.name)}
					{@const v = s.values[i]}
					{@const yv = y(v)}
					<rect
						x={gx + (inner(String(j)) ?? 0)}
						y={Math.min(yv, base)}
						width={inner.bandwidth()}
						height={Math.abs(yv - base)}
						rx="3"
						fill={s.color}
						role="presentation"
						onmousemove={(e) => showTip(`<b>${esc(lb)}</b><br>${esc(s.name)}: ${money(v)}`, e)}
						onmouseleave={hideTip}
					/>
				{/each}
				<text
					x={gx + outer.bandwidth() / 2}
					y={ih + 20}
					text-anchor="middle"
					fill="var(--ink-3)"
					font-size="11">{lb}</text
				>
			{/each}
		</g>
	</svg>
</div>

<style>
	.chartbox {
		position: relative;
		flex: 1 1 auto;
		min-height: 240px;
		max-height: 720px; /* fill a stretched pane, but never run away */
		width: 100%;
	}
	/* Absolutely positioned so the SVG's viewBox-derived intrinsic size can't feed back into
	   the flex/grid auto-height. Without this the box ratchets down on resize and never grows
	   back (measured height -> viewBox -> intrinsic height -> row height -> measured height). */
	svg.chart {
		position: absolute;
		inset: 0;
		height: 100%;
	}
</style>
