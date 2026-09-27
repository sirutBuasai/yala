<script lang="ts">
	// One scale for every row, so bar lengths compare; the columns carry the exact figures a short bar cannot.
	import { formatDelta, formatUnitExact, type Unit } from '$lib/data/primitives';
	import { esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import Bands from '$lib/charts/marks/Bands.svelte';
	import PickRow from '$lib/charts/marks/PickRow.svelte';

	interface Row {
		label: string;
		value: number;
		base: number;
		lo: number;
		hi: number;
		color: string;
	}
	interface Props {
		rows: Row[];
		unit: Unit;
		/** Makes each row a button choosing its label. */
		onpick?: (label: string) => void;
		/** The label currently chosen, which its row marks. */
		picked?: string | null;
	}
	let { rows, unit, onpick, picked }: Props = $props();

	/** One scale for every row, from zero (or the lowest value, when a refund took one below it). */
	const pos = $derived.by(() => {
		const min = Math.min(0, ...rows.flatMap((r) => [r.lo, r.value]));
		const max = Math.max(1, ...rows.flatMap((r) => [r.hi, r.value]));
		const span = max - min;
		return (v: number) => ((v - min) / span) * 100;
	});
	const at = (v: number) => `${pos(v)}%`;

	const fmt = (v: number) => formatUnitExact(v, unit);
	const tip = (r: Row) =>
		`<b>${esc(r.label)}</b><br>${fmt(r.value)} this month` +
		`<br>usual ${fmt(r.base)} (${fmt(r.lo)}–${fmt(r.hi)})`;
</script>

<!-- The markers are SVG circles rather than CSS rings: a box-shadow ring snaps each edge to the pixel
     grid on its own, so at a fractional position it drew thicker on one side than the other. -->
{#snippet average()}
	<svg class="mark" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
		<circle class="base" cx="5" cy="5" r="3.25" />
	</svg>
{/snippet}
{#snippet current(color: string, out: boolean)}
	<svg class="mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
		{#if out}
			<circle class="ring" cx="9" cy="9" r="7.75" />
			<circle class="gap" cx="9" cy="9" r="6.25" />
		{/if}
		<circle cx="9" cy="9" r="5" style:fill={color} />
	</svg>
{/snippet}

<div class="bars">
	<div class="head" aria-hidden="true">
		<span>Category</span><span></span><span class="num">Total</span><span class="num"
			>Δ average</span
		>
	</div>
	{#each rows as r (r.label)}
		{@const delta = r.value - r.base}
		<PickRow label={r.label} {onpick} picked={r.label === picked}>
			<span class="name" class:chosen={r.label === picked}>{r.label}</span>
			<span
				class="lane"
				role="presentation"
				onmousemove={(e) => showTip(tip(r), e)}
				onmouseleave={hideTip}
			>
				<Bands
					radius={3}
					bands={[
						{
							from: pos(0),
							to: pos(r.value),
							fill: `color-mix(in srgb, ${r.color} calc(var(--mark-area) * 100%), transparent)`
						},
						{
							from: pos(r.lo),
							to: pos(r.hi),
							fill: 'color-mix(in srgb, var(--ink-3) 45%, transparent)',
							thickness: 4 / 14
						}
					]}
				/>
				<span class="at" style:left={at(r.base)}>{@render average()}</span>
				<span class="at" style:left={at(r.value)}>
					{@render current(r.color, r.value > r.hi || r.value < r.lo)}
				</span>
			</span>
			<span class="num total">{fmt(r.value)}</span>
			<span class="num delta" class:over={delta > 0} class:under={delta < 0}>
				{formatDelta(delta, unit)}
			</span>
		</PickRow>
	{/each}
	<div class="key" aria-hidden="true">
		<span>{@render current('var(--ink-3)', false)}this month</span>
		<span>{@render average()}average</span>
		<span>
			<span class="k-range">
				<Bands
					radius={2}
					bands={[{ from: 0, to: 100, fill: 'color-mix(in srgb, var(--ink-3) 45%, transparent)' }]}
				/>
			</span>usual range
		</span>
	</div>
</div>

<style>
	/* One grid, each row a subgrid of it, so the figure columns line up down the chart. */
	.bars {
		--lane-h: 14px;

		display: grid;
		flex: 1 1 auto;
		grid-template-columns: minmax(2.5rem, max-content) minmax(2rem, 1fr) max-content max-content;
		align-content: space-evenly;
		gap: var(--gap-row) var(--gap-field);
	}
	.head {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		font-size: var(--text-column);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
	}
	.name {
		color: var(--ink-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name.chosen {
		color: var(--ink);
		font-weight: var(--fw-semibold);
	}
	.lane {
		display: block;
		position: relative;
		height: var(--lane-h);
	}
	/* A zero-size anchor at the value; the marker centres on it, so no offset depends on its size. */
	.at {
		position: absolute;
		top: 50%;
		width: 0;
		height: 0;
	}
	.mark {
		position: absolute;
		left: 0;
		top: 0;
		transform: translate(-50%, -50%);
		overflow: visible;
	}
	.base {
		fill: var(--surface);
		stroke: var(--ink-2);
		stroke-width: 1.5;
	}
	/* Outside its own range: the one claim the markers make per row. */
	.ring {
		fill: none;
		stroke: var(--ink-3);
		stroke-width: 1.5;
	}
	.gap {
		fill: var(--surface);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.total {
		color: var(--ink);
		font-weight: var(--fw-semibold);
	}
	.delta {
		color: var(--ink-2);
	}
	.delta.over {
		color: var(--crit-text);
	}
	.delta.under {
		color: var(--good-text);
	}
	.key {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-8);
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	.key span {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-inline);
	}
	.key .mark {
		position: static;
		transform: none;
	}
	.k-range {
		display: inline-block;
		width: 18px;
		height: 4px;
	}
</style>
