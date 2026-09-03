<script lang="ts">
	// Bullet graphs (Few): a value bar, the threshold it's judged against as a marker, and optional
	// qualitative bands shaded behind. Carries value + target + context in the space a dial would
	// waste on chrome, and reads precisely rather than approximately.
	//
	// Every row is scaled to its own maximum, so rows measured differently (months beside a
	// percentage) sit in one set without one crushing another. Nothing here knows what it's
	// plotting: the label, unit, target and bands all arrive as props.
	import { formatUnit, type Unit } from '$lib/data/primitives';

	interface Row {
		label: string;
		unit: Unit;
		value: number | null;
		target: number;
		bands?: number[];
		note?: string;
	}
	interface Props {
		rows: Row[];
	}
	let { rows }: Props = $props();

	/** Fraction of a row's scale a figure sits at. The scale runs to whatever is furthest out —
	    the value, the target, or the last band — with headroom so a bar at the max still reads as
	    a bar rather than a filled track. */
	function scaled(row: Row) {
		const max = Math.max(row.value ?? 0, row.target, ...(row.bands ?? [0])) * 1.05 || 1;
		const pct = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
		return { pct, max };
	}

	const reached = (row: Row) => row.value != null && row.value >= row.target;
</script>

<div class="bullets">
	{#each rows as row (row.label)}
		{@const s = scaled(row)}
		<div class="bul">
			<div class="head">
				<span class="name">{row.label}</span>
				<span class="figure" class:reached={reached(row)}>
					{row.value == null ? '—' : formatUnit(row.value, row.unit)}
					<span class="of">/ {formatUnit(row.target, row.unit)}</span>
				</span>
			</div>

			<div
				class="track"
				role="meter"
				aria-label={row.label}
				aria-valuenow={row.value ?? undefined}
				aria-valuemin="0"
				aria-valuemax={row.target}
				aria-valuetext={row.value == null
					? 'not available'
					: `${formatUnit(row.value, row.unit)} of ${formatUnit(row.target, row.unit)}`}
			>
				<!-- Bands first, widest last so each shades over the one before it. -->
				{#each (row.bands ?? []).slice().reverse() as edge, i (edge)}
					<span class="band" style:width={s.pct(edge)} style:opacity={0.28 - i * 0.08}></span>
				{/each}
				{#if row.value != null}
					<span class="value" class:reached={reached(row)} style:width={s.pct(row.value)}></span>
				{/if}
				<span class="target" style:left={s.pct(row.target)}></span>
			</div>

			{#if row.note}<p class="note">{row.note}</p>{/if}
		</div>
	{/each}
</div>

<style>
	.bullets {
		display: flex;
		flex-direction: column;
		gap: var(--gap-section);
		flex: 1 1 auto;
		justify-content: center;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--gap-inline);
		margin-bottom: var(--space-3);
	}
	.name {
		font-size: var(--text-control);
		color: var(--ink-2);
		min-width: 0;
	}
	.figure {
		font-size: var(--text-row);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.figure.reached {
		color: var(--good-text);
	}
	.of {
		color: var(--ink-3);
		font-weight: var(--fw-regular);
	}
	.track {
		position: relative;
		height: 18px;
		border-radius: var(--radius-sm);
		background: var(--inset);
		overflow: hidden;
	}
	.band {
		position: absolute;
		inset-block: 0;
		left: 0;
		background: var(--ink-2);
	}
	/* Inset vertically so the bands stay visible either side of the bar — the bar is the measure,
	   the bands are context, and Few's design keeps that hierarchy legible. */
	.value {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 3px;
		background: var(--lav);
	}
	.value.reached {
		background: var(--good);
	}
	.target {
		position: absolute;
		top: -1px;
		bottom: -1px;
		width: 2px;
		background: var(--ink);
	}
	.note {
		margin: var(--space-3) 0 0;
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
</style>
