<script lang="ts">
	import { line, area } from 'd3-shape';
	import { moneyYScale, logYScale, labelIndices } from '$lib/charts/axis';
	import { money, esc } from '$lib/utils/format';
	import { clamp } from '$lib/utils/num';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Legend from '$lib/charts/Legend.svelte';

	interface Series {
		name: string;
		values: (number | null)[];
		color: string;
		/** Draw a gradient area under this series (single-series area charts). */
		area?: boolean;
		/** Render as a dotted line — a secondary reading, or a projection, against a primary one. */
		dashed?: boolean;
	}
	interface Props {
		labels: string[];
		series: Series[];
		/** Format the value axis + tooltip as percentages instead of money. */
		percent?: boolean;
		/** Log-scale the value axis — for series spanning orders of magnitude. */
		log?: boolean;
		/** Label each line at its right end instead of using a legend (many-series charts). */
		endLabels?: boolean;
	}
	let { labels, series, percent = false, log = false, endLabels = false }: Props = $props();

	const showLegend = $derived(!endLabels && series.length > 1);

	// Rendered at the measured pixel size of the shared `.figurebox` (see app.css), which also
	// bounds how tall the chart may grow inside a stretched pane.
	let boxW = $state(0);
	let boxH = $state(0);
	const W = $derived(boxW || 1100);
	const H = $derived(boxH || 300);
	// End labels need room on the right for "Subscription $0.7k"-sized text. That room is a share of
	// the box rather than a constant, so a half-width card doesn't hand most of its plot to labels.
	const m = $derived({ t: 16, r: endLabels ? clamp(W * 0.2, 96, 170) : 16, b: 28, l: 60 });
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

	const shown = $derived(new Set(labelIndices(n, iw, labels)));

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

	// A name for the chart, since an unlabelled role="img" announces only "image". Says what is
	// plotted and over what — the values themselves stay reachable as text via the legend / table.
	const label = $derived(
		`Line chart: ${series.map((sr) => sr.name).join(', ')}` +
			(labels.length ? ` from ${labels[0]} to ${labels[labels.length - 1]}` : '')
	);

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

{#if showLegend}
	<!-- Dashed series are keyed too: a dashed line is a real second reading, so leaving it out left
	     neither line identifiable. -->
	<Legend keys={series} />
{/if}

<div class="figurebox" bind:clientWidth={boxW} bind:clientHeight={boxH}>
	<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label={label}>
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
