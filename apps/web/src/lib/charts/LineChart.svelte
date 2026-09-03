<script lang="ts">
	import { line, area } from 'd3-shape';
	import { moneyYScale, logYScale } from '$lib/charts/axis';
	import { money, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';

	interface Series {
		name: string;
		values: (number | null)[];
		color: string;
		/** Draw a gradient area under this series (single-series area charts). */
		area?: boolean;
		/** Render as a dotted line (e.g. a projection) and omit from the legend. */
		dashed?: boolean;
	}
	interface Props {
		labels: string[];
		series: Series[];
		/** Format the value axis + tooltip as percentages instead of money. */
		percent?: boolean;
		legend?: boolean;
		/** Log-scale the value axis — for series spanning orders of magnitude. */
		log?: boolean;
		/** Label each line at its right end instead of using a legend (many-series charts). */
		endLabels?: boolean;
	}
	let {
		labels,
		series,
		percent = false,
		legend = false,
		log = false,
		endLabels = false
	}: Props = $props();

	// Render at the measured pixel size (as BarChart does) so axis and label type stay a constant
	// on-screen size instead of shrinking with the pane — a fixed viewBox made these illegible in a
	// half-width card.
	let boxW = $state(0);
	let boxH = $state(0);
	const W = $derived(boxW || 1100);
	const H = $derived(boxH || 300);
	// End labels need room on the right for "Subscription $0.7k"-sized text.
	const m = $derived({ t: 16, r: endLabels ? 150 : 16, b: 28, l: 60 });
	const iw = $derived(W - m.l - m.r);
	const ih = $derived(H - m.t - m.b);
	const n = $derived(labels.length);
	// Unique gradient id per instance so multiple area charts don't collide.
	const gid = 'lg-' + Math.random().toString(36).slice(2, 9);

	const flat = $derived(series.flatMap((s) => s.values).filter((v): v is number => v != null));
	const axis = $derived(log ? logYScale(flat, ih) : moneyYScale(flat, ih));
	const y = $derived(axis.y);
	const ticks = $derived(axis.ticks);
	const xPos = (i: number) => (n > 1 ? (iw * i) / (n - 1) : iw / 2);
	// A log axis can't place zero or negatives, so those points break the line instead.
	const plottable = (v: number | null): v is number => v != null && (!log || v > 0);

	const fmt = (v: number) => (percent ? `${Math.round(v)}%` : money(v));
	const tickFmt = (v: number) => (percent ? `${v}%` : money(v));

	const paths = $derived(
		series.map((s) => {
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

	const stride = $derived(Math.max(1, Math.ceil(n / 12)));

	/**
	 * Right-edge labels for many-series charts, nudged apart so ten lines stay readable without a
	 * legend: push each down to clear its predecessor, then if the stack overruns the plot, pin the
	 * last and push back up — so every label lands on canvas whatever the data does.
	 */
	const GAP = 14;
	const ends = $derived.by(() => {
		if (!endLabels) return [];
		const list = series
			.map((s) => {
				const last = [...s.values].reverse().findIndex(plottable);
				const i = last < 0 ? -1 : n - 1 - last;
				return i < 0 ? null : { name: s.name, color: s.color, value: s.values[i] as number, i };
			})
			.filter((e): e is NonNullable<typeof e> => e !== null)
			.map((e) => ({ ...e, y0: y(e.value), y: y(e.value) }))
			.sort((a, b) => a.y0 - b.y0);
		for (let i = 1; i < list.length; i++) list[i]!.y = Math.max(list[i]!.y, list[i - 1]!.y + GAP);
		const last = list[list.length - 1];
		if (last && last.y > ih) {
			last.y = ih;
			for (let i = list.length - 2; i >= 0; i--)
				list[i]!.y = Math.min(list[i]!.y, list[i + 1]!.y - GAP);
		}
		return list;
	});

	let hover = $state<number | null>(null);

	function onMove(e: MouseEvent) {
		const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		let i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
		i = Math.max(0, Math.min(n - 1, i));
		hover = i;
		const lines = series
			.filter((s) => s.values[i] != null)
			// Busiest-first so a ten-line tooltip reads top-down by magnitude.
			.sort((a, b) => (b.values[i] as number) - (a.values[i] as number))
			.map((s) => `${esc(s.name)}: ${fmt(s.values[i] as number)}`)
			.join('<br>');
		showTip(`<b>${esc(labels[i])}</b><br>${lines}`, e);
	}
	function onLeave() {
		hover = null;
		hideTip();
	}
</script>

{#if legend && series.filter((s) => !s.dashed).length > 1}
	<div class="legend">
		{#each series.filter((s) => !s.dashed) as s (s.name)}
			<span class="k"><span class="sw" style:background={s.color}></span>{s.name}</span>
		{/each}
	</div>
{/if}

<div class="chartbox" bind:clientWidth={boxW} bind:clientHeight={boxH}>
	<svg class="chart" viewBox="0 0 {W} {H}" role="img">
		<defs>
			{#each series as s, si (s.name)}
				{#if s.area}
					<linearGradient id="{gid}-{si}" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color={s.color} stop-opacity="0.28" />
						<stop offset="100%" stop-color={s.color} stop-opacity="0" />
					</linearGradient>
				{/if}
			{/each}
		</defs>
		<g class="axis" transform="translate({m.l},{m.t})">
			{#each ticks as t (t)}
				<line class="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
				<text x={-8} y={y(t) + 4} text-anchor="end">{tickFmt(t)}</text>
			{/each}

			{#each series as s, si (s.name)}
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

			{#each labels as lb, i (lb)}
				{#if i % stride === 0 || i === n - 1}
					<text x={xPos(i)} y={ih + 20} text-anchor="middle">{lb}</text>
				{/if}
			{/each}

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
				{#each series as s (s.name)}
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
				height={ih}
				fill="transparent"
				role="presentation"
				onmousemove={onMove}
				onmouseleave={onLeave}
			/>
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
	   the flex/grid auto-height (see BarChart). */
	svg.chart {
		position: absolute;
		inset: 0;
		height: 100%;
	}
</style>
