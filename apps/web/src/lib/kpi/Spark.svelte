<script lang="ts">
	// The faint chart behind a KPI's number: bars, a line, or a filled area. One component for all
	// three, because they differ only in the mark drawn over one shared scale.
	//
	// Deliberately axis-less, tick-less and tooltip-less: this says SHAPE, and the number in front of
	// it says the value. It is also mixed heavily towards transparent, so the stat and the badge stay
	// legible over it in both themes — the badge is the smallest type on the card and sets that limit.
	import type { Series } from '$lib/data/primitives';

	interface Props {
		series: Series;
		shape: 'bar' | 'line' | 'area';
		color: string;
	}
	let { series, shape, color }: Props = $props();

	// A fixed viewBox with `preserveAspectRatio: none`: the mark is decorative, so stretching it is
	// fine and costs nothing to measure.
	const W = 100;
	const H = 32;

	const values = $derived(series.points.map((p) => p.value ?? 0));
	// Zero-anchored, so a bar's height reads as a magnitude and a dip towards zero reads as one.
	const top = $derived(Math.max(0, ...values) || 1);
	const bottom = $derived(Math.min(0, ...values));
	const span = $derived(top - bottom || 1);

	const y = (v: number) => H - ((v - bottom) / span) * H;
	const x = (i: number) => (values.length < 2 ? W / 2 : (i / (values.length - 1)) * W);

	/** One bar per point, with a hairline gap; floored at 1px so an empty month still marks its slot. */
	const bars = $derived.by(() => {
		const step = W / Math.max(1, values.length);
		return values.map((v, i) => {
			const base = y(Math.min(0, v));
			const tip = y(Math.max(0, v));
			return { x: i * step + step * 0.15, w: step * 0.7, y: tip, h: Math.max(1, base - tip) };
		});
	});

	const line = $derived(values.map((v, i) => `${x(i)},${y(v)}`).join(' '));
	// Closed on the ZERO line, not the box's bottom edge: for a series that dips negative those are not
	// the same place, and filling to the edge would shade the dip as if it were a gain.
	const filled = $derived(`0,${y(0)} ${line} ${W},${y(0)}`);
</script>

<svg
	class="spark"
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="none"
	aria-hidden="true"
	style:--mark={color}
>
	{#if shape === 'bar'}
		{#each bars as b, i (i)}
			<rect x={b.x} y={b.y} width={b.w} height={b.h} class="fill" />
		{/each}
	{:else if shape === 'area'}
		<polygon points={filled} class="fill" />
		<polyline points={line} class="stroke" />
	{:else}
		<polyline points={line} class="stroke" />
	{/if}
</svg>

<style>
	.spark {
		display: block;
		width: 100%;
		height: 100%;
	}
	/* How faint is set by the BADGE, not the number: the badge is the smallest type on the card, and a
	   red badge over a red fill is the tightest pair there is. Measured at 16% it fell under 4.5:1 in
	   dark mode; 9% keeps every stat and badge clear of it in both themes. The stroke may carry more of
	   the hue — it is a hairline crossing a glyph, not the background behind one — but not so much that
	   a line-only KPI with a badge would be the exception. */
	.fill {
		fill: color-mix(in srgb, var(--mark) 9%, transparent);
	}
	.stroke {
		fill: none;
		stroke: color-mix(in srgb, var(--mark) 32%, transparent);
		stroke-width: 1.5;
		/* The viewBox is stretched, so an unscaled width keeps the line the same weight at any pane size. */
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
	}
</style>
