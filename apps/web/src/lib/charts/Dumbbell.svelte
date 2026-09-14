<script lang="ts">
	// A row's typical level and its latest one, joined — read against the range it usually falls in.
	// Each lane is scaled to its OWN range, so a category ten times another's size still shows its move;
	// nothing here is comparable ACROSS rows, which is the trade that makes the small rows legible.
	import { formatDelta, formatUnit, type Unit } from '$lib/data/primitives';
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

	/** A row's lane: its own range, widened to take in a value that broke out of it, and never
	    zero-width — a category that spent the same every month would otherwise divide by zero. */
	function lane(r: Row) {
		const lo = Math.min(r.lo, r.value);
		const hi = Math.max(r.hi, r.value);
		const pad = Math.max(1, (hi - lo) * 0.08);
		const min = lo - pad;
		const span = hi + pad - min;
		return (v: number) => `${((v - min) / span) * 100}%`;
	}

	const tip = (r: Row) =>
		`<b>${esc(r.label)}</b><br>${formatUnit(r.value, unit)} this month` +
		`<br>usual ${formatUnit(r.base, unit)} (${formatUnit(r.lo, unit)}–${formatUnit(r.hi, unit)})`;
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
	/* Rows spread through whatever height the pane has, rather than stacking at the top and leaving an
	   empty band under the last one. */
	.dumb {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		justify-content: space-evenly;
		gap: var(--gap-row);
	}
	.row {
		display: grid;
		grid-template-columns: 4.5rem 1fr 3.6rem;
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
		height: 14px;
	}
	.range {
		position: absolute;
		top: 5px;
		height: 4px;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--ink-3) 26%, transparent);
	}
	.link {
		position: absolute;
		top: 6px;
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
		top: 3px;
		width: 8px;
		height: 8px;
		margin-left: -4px;
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
	.now {
		top: 2px;
		width: 10px;
		height: 10px;
		margin-left: -5px;
		background: var(--fill);
	}
	/* Outside its own range — the one row-level claim this chart makes, so it is the one ring. */
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
