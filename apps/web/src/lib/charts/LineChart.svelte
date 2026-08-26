<script lang="ts">
	import { line, area } from 'd3-shape';
	import { moneyYScale } from '$lib/charts/axis';
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
	}
	let { labels, series, percent = false, legend = false }: Props = $props();

	const W = 1100;
	const H = 300;
	const m = { t: 16, r: 16, b: 28, l: 60 };
	const iw = W - m.l - m.r;
	const ih = H - m.t - m.b;
	const n = $derived(labels.length);
	// Unique gradient id per instance so multiple area charts don't collide.
	const gid = 'lg-' + Math.random().toString(36).slice(2, 9);

	const flat = $derived(series.flatMap((s) => s.values).filter((v): v is number => v != null));
	const axis = $derived(moneyYScale(flat, ih));
	const y = $derived(axis.y);
	const ticks = $derived(axis.ticks);
	const xPos = (i: number) => (n > 1 ? (iw * i) / (n - 1) : iw / 2);

	const fmt = (v: number) => (percent ? `${Math.round(v)}%` : money(v));
	const tickFmt = (v: number) => (percent ? `${v}%` : money(v));

	const paths = $derived(
		series.map((s) => {
			const lineGen = line<number | null>()
				.defined((v) => v != null)
				.x((_, i) => xPos(i))
				.y((v) => y(v as number));
			const areaGen = area<number | null>()
				.defined((v) => v != null)
				.x((_, i) => xPos(i))
				.y0(y(0))
				.y1((v) => y(v as number));
			return { line: lineGen(s.values) ?? '', area: s.area ? (areaGen(s.values) ?? '') : '' };
		})
	);

	const stride = $derived(Math.max(1, Math.ceil(n / 12)));

	let hover = $state<number | null>(null);

	function onMove(e: MouseEvent) {
		const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		let i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
		i = Math.max(0, Math.min(n - 1, i));
		hover = i;
		const lines = series
			.filter((s) => s.values[i] != null)
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
