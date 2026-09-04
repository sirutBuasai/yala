<script lang="ts">
	// One bar chart for 1..n series. A single series renders as plain columns (with value
	// labels); two or more render as grouped bars (with a legend). The user picks "Bar" and
	// adds one or more data — they never choose between "column" and "grouped bars".
	import { scaleBand } from 'd3-scale';
	import { moneyYScale } from '$lib/charts/axis';
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
	}
	let { labels, series }: Props = $props();

	const single = $derived(series.length <= 1);

	// Rendered at the measured pixel size of the shared `.figurebox` (see app.css), which also
	// bounds how tall the chart may grow inside a stretched pane.
	let boxW = $state(0);
	let boxH = $state(0);
	const W = $derived(boxW || 1100);
	const H = $derived(boxH || 300);
	const m = { t: 22, r: 14, b: 30, l: 56 };
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

	// A name for the chart, since an unlabelled role="img" announces only "image".
	const label = $derived(
		`Bar chart: ${series.map((sr) => sr.name).join(', ')} across ${labels.length} periods`
	);
</script>

{#if !single}
	<Legend keys={series} />
{/if}

<div class="figurebox" bind:clientWidth={boxW} bind:clientHeight={boxH}>
	<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label={label}>
		<g class="axis" transform="translate({m.l},{m.t})">
			{#each ticks as t (t)}
				<line class="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{moneyK(t)}</text>
			{/each}
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
						fill={s.color}
						role="presentation"
						onmousemove={(e) =>
							showTip(`<b>${esc(lb)}</b><br>${single ? '' : esc(s.name) + ': '}${money(v)}`, e)}
						onmouseleave={hideTip}
					/>
					{#if single && v !== 0}
						<text class="vlabel" x={bx + bw / 2} y={Math.min(yv, base) - 6} text-anchor="middle"
							>{moneyK(v)}</text
						>
					{/if}
				{/each}
				<text x={gx + outer.bandwidth() / 2} y={ih + 20} text-anchor="middle">{lb}</text>
			{/each}
		</g>
	</svg>
</div>
