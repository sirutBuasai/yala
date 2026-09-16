<script lang="ts">
	// A set of progress bars, one per row, each read against its own target — see `fillTo` for the scaling
	// rule the rows share with the KPI meter.
	import { NO_VALUE } from '$lib/copy';
	import { fillTo, fillText } from '$lib/charts/progress';
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
</script>

<div class="bullets">
	{#each rows as row (row.label)}
		{@const f = fillTo(row.value, row.target)}
		<div class="bul">
			<!-- The footnote sits on the label line: a third line per row cost more height than the bars. -->
			<div class="head">
				<span class="name">
					{row.label}{#if row.note}<small>{labelText(row.note)}</small>{/if}
				</span>
				<span class="figure" class:reached={f?.reached}>
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
				aria-valuetext={fillText(row.value, row.target, row.unit)}
			>
				{#if f}
					<span class="value" class:reached={f.reached} style:width={f.width}></span>
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
	/* An equal share of the pane's height each, the fixed label line leaving the rest to the bar.

	   The floor is load-bearing: `flex-basis: 0` alone has no intrinsic height, so in a container that
	   states none — an overlay rather than a sized pane — every row collapsed onto the others. */
	/* A basis of 0 resolves to no height at all where there is none to share out, and a folded card hugs its
	   content — so rows claiming none measured zero and painted below the card's bottom edge. `min-content`
	   is what makes the floor provably enough for whatever a row holds. */
	.bul {
		display: flex;
		flex-direction: column;
		flex: 1 1 0;
		min-height: max(2.5rem, min-content);
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
	.track {
		position: relative;
		flex: 1 1 auto;
		min-height: 10px;
		max-height: 32px;
		border-radius: var(--radius-sm);
		background: var(--inset);
		overflow: hidden;
	}
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
	/* Notched, so a full bar and an overflowing one are told apart without stretching the track. */
	.over {
		position: absolute;
		inset-block: 0;
		right: 0;
		width: 10px;
		background: repeating-linear-gradient(-45deg, var(--surface) 0 2px, transparent 2px 5px);
	}
</style>
