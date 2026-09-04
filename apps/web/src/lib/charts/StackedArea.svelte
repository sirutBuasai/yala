<script lang="ts">
	// Stacked bands over an ordered axis. Where overlaid lines answer "what is each one doing?",
	// stacking answers "what is the mix, and how has it shifted?" — the band thickness is the share
	// and the boundaries move as composition changes.
	//
	// Series stack in the order given, first at the bottom. Nothing here knows what it's plotting:
	// labels, series and unit all arrive as props, and the axis scales to whatever the totals reach.
	import { area, line } from 'd3-shape';
	import { esc } from '$lib/utils/format';
	import { formatUnit, type Unit } from '$lib/data/primitives';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import { labelIndices } from '$lib/charts/axis';
	import Legend from '$lib/charts/Legend.svelte';

	interface Band {
		name: string;
		values: number[];
		color: string;
	}
	interface Props {
		labels: string[];
		series: Band[];
		unit: Unit;
	}
	let { labels, series, unit }: Props = $props();

	// Rendered at the measured pixel size of the shared `.figurebox` (see app.css), which also
	// bounds how tall the chart may grow inside a stretched pane.
	let boxW = $state(0);
	let boxH = $state(0);
	const W = $derived(boxW || 900);
	const H = $derived(boxH || 300);
	const m = { t: 12, r: 16, b: 28, l: 46 };
	const iw = $derived(W - m.l - m.r);
	const ih = $derived(H - m.t - m.b);
	const n = $derived(labels.length);

	const xPos = (i: number) => (n > 1 ? (iw * i) / (n - 1) : iw / 2);

	/** Running totals per point, so each band sits on the one below it. */
	const stacks = $derived.by(() => {
		const base = new Array(n).fill(0);
		return series.map((s) => {
			const lower = [...base];
			for (let i = 0; i < n; i++) base[i] += s.values[i] ?? 0;
			return { band: s, lower, upper: [...base] };
		});
	});

	const peak = $derived(Math.max(1, ...(stacks.at(-1)?.upper ?? [1])));
	const y = $derived((v: number) => ih - (v / peak) * ih);

	// Round ticks over the stacked total: quarters read cleanly for a share chart and stay
	// reasonable for absolute totals too.
	const ticks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => peak * f));

	const paths = $derived(
		stacks.map(({ band, lower, upper }) => {
			const gen = area<number>()
				.x((_, i) => xPos(i))
				.y0((_, i) => y(lower[i] ?? 0))
				.y1((_, i) => y(upper[i] ?? 0));
			const top = line<number>()
				.x((_, i) => xPos(i))
				.y((_, i) => y(upper[i] ?? 0));
			return { band, fill: gen(upper) ?? '', edge: top(upper) ?? '' };
		})
	);

	const shown = $derived(new Set(labelIndices(n, iw, labels)));

	function hover(e: MouseEvent, i: number) {
		const lines = stacks
			.map(
				({ band }) =>
					`<span style="color:${band.color}">■</span> ${esc(band.name)} ${formatUnit(band.values[i] ?? 0, unit)}`
			)
			.reverse()
			.join('<br>');
		showTip(`<b>${esc(labels[i] ?? '')}</b><br>${lines}`, e);
	}
</script>

<div class="figurebox" bind:clientWidth={boxW} bind:clientHeight={boxH}>
	<svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Stacked area chart">
		<g class="axis" transform={`translate(${m.l},${m.t})`}>
			{#each ticks as t (t)}
				<line class="gridline" x1="0" y1={y(t)} x2={iw} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{formatUnit(t, unit)}</text>
			{/each}

			{#each paths as p (p.band.name)}
				<path d={p.fill} fill={p.band.color} opacity="0.75" />
				<path d={p.edge} fill="none" stroke={p.band.color} stroke-width="1.5" />
			{/each}

			{#each labels as lb, i (lb + i)}
				{#if shown.has(i)}
					<text x={xPos(i)} y={ih + 19} text-anchor="middle">{lb}</text>
				{/if}
			{/each}

			<!-- One hit target per point, so a hover reports the whole mix at that date. -->
			{#each labels as lb, i (lb + i)}
				<rect
					x={xPos(i) - iw / Math.max(1, n * 2)}
					y="0"
					width={iw / Math.max(1, n)}
					height={ih}
					fill="transparent"
					onmousemove={(e) => hover(e, i)}
					onmouseleave={hideTip}
					role="presentation"
				/>
			{/each}
		</g>
	</svg>
</div>

{#if series.length > 1}
	<!-- Reversed and under the plot, so the keys read top-to-bottom in the order the bands stack. -->
	<Legend keys={series} below reverse />
{/if}
