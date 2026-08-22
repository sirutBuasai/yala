<script lang="ts">
	import { scaleBand, scaleLinear } from 'd3-scale';
	import { money, moneyK, esc } from '$lib/format';
	import { showTip, hideTip } from '$lib/tooltip';

	interface Props {
		labels: string[];
		values: number[];
		/** Single fill for the whole series (CSS var), e.g. 'var(--salmon)'. */
		color?: string;
		valueLabels?: boolean;
	}
	let { labels, values, color = 'var(--lav)', valueLabels = true }: Props = $props();

	// Render at the measured pixel size so the chart fills (and grows with) its pane.
	let boxW = $state(0);
	let boxH = $state(0);
	const W = $derived(boxW || 560);
	const H = $derived(boxH || 260);
	const m = { t: 22, r: 12, b: 28, l: 52 };
	const iw = $derived(W - m.l - m.r);
	const ih = $derived(H - m.t - m.b);

	const x = $derived(scaleBand<string>().domain(labels).range([0, iw]).padding(0.34));
	const y = $derived(
		scaleLinear()
			.domain([Math.min(0, ...values), Math.max(0, ...values)])
			.nice()
			.range([ih, 0])
	);
	const ticks = $derived(y.ticks(4));
	const bw = $derived(x.bandwidth());
	const base = $derived(y(0));

	function bar(i: number) {
		const v = values[i];
		const yv = y(v);
		return { x: x(labels[i]) ?? 0, y: Math.min(yv, base), h: Math.abs(yv - base) };
	}
</script>

<div class="chartbox" bind:clientWidth={boxW} bind:clientHeight={boxH}>
	<svg class="chart" viewBox="0 0 {W} {H}" role="img">
		<g class="axis" transform="translate({m.l},{m.t})">
			{#each ticks as t (t)}
				<line class="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{moneyK(t)}</text>
			{/each}
			{#each labels as lb, i (lb)}
				{@const b = bar(i)}
				<rect
					x={b.x}
					y={b.y}
					width={bw}
					height={b.h}
					rx="4"
					fill={color}
					role="presentation"
					onmousemove={(e) => showTip(`<b>${esc(lb)}</b><br>${money(values[i])}`, e)}
					onmouseleave={hideTip}
				/>
				{#if valueLabels && values[i] !== 0}
					<text class="vlabel" x={b.x + bw / 2} y={b.y - 6} text-anchor="middle" font-size="10"
						>{moneyK(values[i])}</text
					>
				{/if}
				<text x={b.x + bw / 2} y={ih + 18} text-anchor="middle" fill="var(--ink-3)" font-size="11"
					>{lb}</text
				>
			{/each}
		</g>
	</svg>
</div>

<style>
	.chartbox {
		flex: 1 1 auto;
		min-height: 200px;
		max-height: 720px; /* fill a stretched pane, but never run away */
		width: 100%;
	}
	svg.chart {
		height: 100%;
	}
</style>
