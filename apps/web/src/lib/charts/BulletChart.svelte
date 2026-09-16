<script module lang="ts">
	/** How far the label line may be scaled down before small type is the worse answer. Holds the smallest
	    reading around 11px, under which a threshold's name stops being comfortably legible. */
	const MIN_SCALE = 0.85;
</script>

<script lang="ts">
	// A set of progress bars, one per row, each read against its own target — see `fillTo` for the scaling
	// rule the rows share with the KPI meter.
	import { NO_VALUE } from '$lib/copy';
	import { SLACK } from '$lib/layout/grid/spill';
	import { contentFloor, watchWidth } from '$lib/ui/fit';
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

	let box = $state<HTMLElement>();

	/** Scale the label line into the room it has, the way a chart scales into its pane: a truncated label reads
	    as a different threshold than the one it names. Measured at full size, applied as a multiplier. */
	function refit(): void {
		const el = box;
		if (!el) return;

		el.style.setProperty('--fit', '1');
		const need = [...el.querySelectorAll<HTMLElement>('.head')].reduce((worst, head) => {
			const parts = [...head.children].reduce((sum, c) => sum + c.scrollWidth, 0);
			const gap = parseFloat(getComputedStyle(head).columnGap) || 0;
			return Math.max(worst, parts + gap);
		}, 0);
		const room = el.clientWidth;
		// `SLACK` off the room: scaled to exactly what is available, the widest line lands a subpixel over and
		// ellipsises the label the scale was there to save.
		const fit = need && room ? Math.min(1, (room - SLACK) / need) : 1;
		el.style.setProperty('--fit', String(Math.max(MIN_SCALE, fit)));
		// Under the floor the line would have to be truncated, so state the width it cannot go under and let the
		// pane overrun: an overrun is what makes a resize refuse (see `spill.ts`).
		el.style.setProperty('--content-floor', contentFloor(need * MIN_SCALE));
	}

	$effect(() => {
		const el = box;
		if (!el) return;
		// `rows` read so a change of data re-measures, not only a change of box.
		void rows;
		const watch = watchWidth(el, refit, { settled: true });
		return watch.stop;
	});
</script>

<div class="bullets" data-floor bind:this={box}>
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
	/* `--fit` is the measured scale (see `refit`). Ellipsis remains for what the scale floor cannot cover. */
	.name {
		font-size: calc(var(--text-control) * var(--fit, 1));
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
		font-size: calc(var(--text-caption) * var(--fit, 1));
		margin-left: var(--space-3);
	}
	.figure {
		font-size: calc(var(--text-row) * var(--fit, 1));
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
