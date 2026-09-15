<script lang="ts">
	// A row's typical level and its latest one, joined, against the range it usually falls in. Each lane is
	// scaled to its own range, so nothing is comparable across rows — the trade that keeps small rows legible.
	import { formatDelta, formatUnitExact, type Unit } from '$lib/data/primitives';
	import { esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';

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
	}
	let { rows, unit }: Props = $props();

	/** A row's range, widened to take in a breakout value. Never zero-width: a category that spent the
	    same every month would divide by zero. */
	function lane(r: Row) {
		const lo = Math.min(r.lo, r.value);
		const hi = Math.max(r.hi, r.value);
		const pad = Math.max(1, (hi - lo) * 0.08);
		const min = lo - pad;
		const span = hi + pad - min;
		return (v: number) => `${((v - min) / span) * 100}%`;
	}

	const fmt = (v: number) => formatUnitExact(v, unit);
	const tip = (r: Row) =>
		`<b>${esc(r.label)}</b><br>${fmt(r.value)} this month` +
		`<br>usual ${fmt(r.base)} (${fmt(r.lo)}–${fmt(r.hi)})`;
</script>

<div class="dumb">
	{#each rows as r (r.label)}
		{@const at = lane(r)}
		{@const delta = r.value - r.base}
		<div class="row">
			<span class="name">{r.label}</span>
			<div
				class="lane"
				role="presentation"
				onmousemove={(e) => showTip(tip(r), e)}
				onmouseleave={hideTip}
			>
				<span class="range" style:left={at(r.lo)} style:right={`calc(100% - ${at(r.hi)})`}></span>
				<span
					class="link"
					style:left={at(Math.min(r.base, r.value))}
					style:right={`calc(100% - ${at(Math.max(r.base, r.value))})`}
				></span>
				<span class="base" style:left={at(r.base)}></span>
				<span
					class="now"
					class:out={r.value > r.hi || r.value < r.lo}
					style:left={at(r.value)}
					style:--fill={r.color}
				></span>
			</div>
			<span class="delta" class:over={delta > 0} class:under={delta < 0}>
				{formatDelta(delta, unit)}
			</span>
		</div>
	{/each}
</div>

<style>
	/* Rows spread through the pane's height rather than stacking at the top. */
	.dumb {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		justify-content: space-evenly;
		gap: var(--gap-row);
	}
	/* Two gutters that hold their text, the lane taking the rest, and the marker geometry below. */
	.row {
		--name-col: 4.5rem;
		--delta-col: 3.6rem;
		--lane-h: 14px;
		--now-size: 10px;
		--base-size: 8px;
		--track-h: 4px;

		display: grid;
		grid-template-columns: var(--name-col) 1fr var(--delta-col);
		gap: var(--gap-inline);
		align-items: center;
		font-size: var(--text-caption);
	}
	.name {
		color: var(--ink-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lane {
		position: relative;
		height: var(--lane-h);
	}
	/* Every layer is centred on the lane, so each offset is half the difference in heights. */
	.range {
		position: absolute;
		top: calc((var(--lane-h) - var(--track-h)) / 2);
		height: var(--track-h);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--ink-3) 26%, transparent);
	}
	.link {
		position: absolute;
		top: calc((var(--lane-h) - 2px) / 2);
		height: 2px;
		background: color-mix(in srgb, var(--ink-3) 55%, transparent);
	}
	/* Both markers are centred on their value, so the offset is half the dot. */
	.base,
	.now {
		position: absolute;
		border-radius: var(--radius-pill);
	}
	.base {
		top: calc((var(--lane-h) - var(--base-size)) / 2);
		width: var(--base-size);
		height: var(--base-size);
		margin-left: calc(var(--base-size) / -2);
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
	.now {
		top: calc((var(--lane-h) - var(--now-size)) / 2);
		width: var(--now-size);
		height: var(--now-size);
		margin-left: calc(var(--now-size) / -2);
		background: var(--fill);
	}
	/* Outside its own range: the one claim this chart makes per row. */
	.now.out {
		box-shadow:
			0 0 0 1.5px var(--surface),
			0 0 0 3px var(--ink-3);
	}
	.delta {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}
	.delta.over {
		color: var(--crit-text);
	}
	.delta.under {
		color: var(--good-text);
	}
</style>
