<script lang="ts">
	// Progress bars against a target. The track IS the target, so a row reading 48% fills 48% of it and
	// two rows measured in different units are still comparable at a glance.
	//
	// Not scaled to the value: a track that stretched to whatever was furthest out drew a row at 250% and
	// a row at 15-of-6 as the same nearly-full bar, which is the one thing this must not do. Past the
	// target the bar fills and the overflow is marked instead.
	import { NO_VALUE } from '$lib/copy';
	import { formatUnit, type Unit } from '$lib/data/primitives';
	import { labelText, type Label } from '$lib/ui/label';

	interface Row {
		label: string;
		unit: Unit;
		value: number | null;
		target: number;
		/** Comes straight off the scalar behind the row, so it arrives as a label and is read for text. */
		note?: Label;
	}
	interface Props {
		rows: Row[];
	}
	let { rows }: Props = $props();

	/** How far along its target a row sits, capped at the track. Null where there is nothing to draw. */
	function fill(row: Row): { width: string; over: boolean } | null {
		if (row.value == null || !row.target) return null;

		const share = (row.value / row.target) * 100;
		return { width: `${Math.min(100, Math.max(0, share))}%`, over: share > 100 };
	}

	const reached = (row: Row) => row.value != null && row.value >= row.target;
</script>

<div class="bullets">
	{#each rows as row (row.label)}
		{@const f = fill(row)}
		<div class="bul">
			<!-- The row's footnote sits on the label line rather than under the bar: it is what the figure is
			     measured against, and a third line per row cost more height than the bars themselves. -->
			<div class="head">
				<span class="name">
					{row.label}{#if row.note}<small>{labelText(row.note)}</small>{/if}
				</span>
				<span class="figure" class:reached={reached(row)}>
					{row.value == null ? NO_VALUE : formatUnit(row.value, row.unit)}
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
				{#if f}
					<span class="value" class:reached={reached(row)} style:width={f.width}></span>
					{#if f.over}<span class="over" aria-hidden="true"></span>{/if}
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.bullets {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		flex: 1 1 auto;
	}
	/* Each row takes an equal share of whatever height the pane has, and its label line is fixed, so the
	   leftover goes to the bar: shrink the pane and the bars thin, grow it and they thicken. */
	.bul {
		display: flex;
		flex-direction: column;
		flex: 1 1 0;
		min-height: 0;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--gap-inline);
		margin-bottom: var(--space-3);
		flex: none;
	}
	.name {
		font-size: var(--text-control);
		color: var(--ink-2);
		min-width: 0;
		/* Truncated rather than wrapped: a label that took a second line would steal the bar's height, and
		   the figure to its right is the reading. */
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.name small {
		color: var(--ink-3);
		font-size: var(--text-caption);
		margin-left: var(--space-3);
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
	/* Floored so a short pane still shows a bar, and capped so a tall one doesn't draw slabs. */
	.track {
		position: relative;
		flex: 1 1 auto;
		min-height: 10px;
		max-height: 32px;
		border-radius: var(--radius-sm);
		background: var(--inset);
		overflow: hidden;
	}
	/* Fills the track's height: the track's end IS the target, so there is nothing behind the bar left to
	   see. */
	.value {
		position: absolute;
		inset-block: 0;
		left: 0;
		border-radius: var(--radius-sm);
		background: var(--role-balance);
	}
	.value.reached {
		background: var(--role-saving);
	}
	/* A notched right edge for a row past its target, so a full bar and an overflowing one are told apart
	   without stretching the track and making every row look alike. */
	.over {
		position: absolute;
		inset-block: 0;
		right: 0;
		width: 10px;
		background: repeating-linear-gradient(-45deg, var(--surface) 0 2px, transparent 2px 5px);
	}
</style>
