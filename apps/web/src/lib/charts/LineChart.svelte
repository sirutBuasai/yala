<script lang="ts">
	import { line, area } from 'd3-shape';
	import {
		moneyYScale,
		logYScale,
		labelIndices,
		moneyAxisFormat,
		plotSize
	} from '$lib/charts/axis';
	import { ChartBox } from '$lib/charts/box.svelte';
	import { money, moneyExact, esc } from '$lib/utils/format';
	import { clamp } from '$lib/utils/num';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Legend from '$lib/charts/Legend.svelte';
	import { chartLabel } from '$lib/charts/aria';

	interface Series {
		name: string;
		values: (number | null)[];
		color: string;
		/** Draw a gradient area under this series. */
		area?: boolean;
		/** Render as a dotted line — a secondary reading against a primary one. */
		dashed?: boolean;
	}
	interface Props {
		labels: string[];
		series: Series[];
		/** Format the value axis + tooltip as percentages instead of money. */
		percent?: boolean;
		/** Log-scale the value axis — for series spanning orders of magnitude. */
		log?: boolean;
		/** Label each line at its right end instead of using a legend. */
		endLabels?: boolean;
		/** Fix the value axis to end here instead of at the tallest reading, for a chart whose point is a
		    level partway up. Lines running past it flatten against the top; tooltips still state the true
		    figure. */
		ceiling?: number;
	}
	let {
		labels,
		series,
		percent = false,
		log = false,
		endLabels = false,
		ceiling
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

	const showLegend = $derived(!endLabels && series.length > 1);

	const box = new ChartBox();
	const W = $derived(box.w);
	const H = $derived(box.h);
	// A share of the box, not a constant, so a narrow card doesn't hand most of its plot to labels.
	const m = $derived({ t: 16, r: endLabels ? clamp(W * 0.2, 96, 170) : 16, b: 28, l: 60 });
	const plot = $derived(plotSize(W, H, m));
	const iw = $derived(plot.iw);
	const ih = $derived(plot.ih);
	const n = $derived(labels.length);
	// Unique per instance, so two area charts on one page can't share a gradient.
	const gid = 'lg-' + Math.random().toString(36).slice(2, 9);

	const flat = $derived(plotted.flatMap((s) => s.values).filter((v): v is number => v != null));
	const axis = $derived(log ? logYScale(flat, ih) : moneyYScale(flat, ih, ceiling));
	const y = $derived(axis.y);
	const ticks = $derived(axis.ticks);
	const xPos = (i: number) => (n > 1 ? (iw * i) / (n - 1) : iw / 2);
	// A log axis can't place zero or negatives, so those points break the line instead.
	const plottable = (v: number | null): v is number => v != null && (!log || v > 0);

	const fmt = (v: number) => (percent ? `${Math.round(v)}%` : money(v));
	// The hover carries the cents the end label rounds away.
	const tipFmt = (v: number) => (percent ? `${Math.round(v)}%` : moneyExact(v));
	// Abbreviation decided by the ticks themselves — see `moneyAxisFormat`.
	const moneyTick = $derived(moneyAxisFormat(ticks));
	const tickFmt = (v: number) => (percent ? `${v}%` : moneyTick(v));

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

	const shown = $derived(new Set(labelIndices(n, iw, labels)));

	/**
	 * Right-edge labels nudged apart: push each down to clear its predecessor, then if the stack overruns
	 * the plot, pin the last and push back up, so every label lands on canvas.
	 */
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

	const label = $derived(
		chartLabel(
			'Line chart',
			series.map((sr) => sr.name),
			labels.length ? ` from ${labels[0]} to ${labels[labels.length - 1]}` : ''
		)
	);

	let hover = $state<number | null>(null);

	function onMove(e: MouseEvent) {
		const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		let i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
		i = Math.max(0, Math.min(n - 1, i));
		hover = i;
		const lines = series
			.filter((s) => s.values[i] != null)
			// Largest first, so a many-line tooltip reads top-down by magnitude.
			.sort((a, b) => (b.values[i] as number) - (a.values[i] as number))
			.map((s) => `${esc(s.name)}: ${tipFmt(s.values[i] as number)}`)
			.join('<br>');
		showTip(`<b>${esc(labels[i])}</b><br>${lines}`, e);
	}
	function onLeave() {
		hover = null;
		hideTip();
	}
</script>

{#if showLegend}
	<!-- Dashed series are keyed too: a dashed line is a real second reading, and omitting it left
	     neither line identifiable. -->
	<Legend keys={series} />
{/if}

<div class="figurebox" bind:clientWidth={box.clientWidth} bind:clientHeight={box.clientHeight}>
	<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label={label}>
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
				<text x={-8} y={y(t) + 4} text-anchor="end">{tickFmt(t)}</text>
			{/each}

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

			<!-- Keyed by slot, not by text: two points can share a label, and a duplicate key is fatal. -->
			{#each labels as lb, i (i)}
				{#if shown.has(i)}
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
				height={ih}
				fill="transparent"
				role="presentation"
				onmousemove={onMove}
				onmouseleave={onLeave}
			/>
		</g>
	</svg>
</div>
