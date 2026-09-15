<script lang="ts">
	// A figure against the level it is judged by, inline on the stat's own row: "9.5 yr / 34 yr [####]".
	// Unlike the other KPI marks this one is not decorative — the track's end IS the target, so the fill is
	// the reading. Same scaling rule as `BulletChart`: capped at the target rather than stretched to the
	// value, so two cards using it stay comparable.
	//
	// Inline rather than under the figure so it costs the card no height of its own, and takes whatever
	// width the pane has left over.
	import { formatUnit, type Unit } from '$lib/data/primitives';

	interface Props {
		value: number | null;
		target: number;
		unit: Unit;
		color: string;
	}
	let { value, target, unit, color }: Props = $props();

	const share = $derived(value == null || !target ? null : (value / target) * 100);
	const width = $derived(share == null ? '0%' : `${Math.min(100, Math.max(0, share))}%`);
	const reached = $derived(share != null && share >= 100);
</script>

<div class="meter" style:--mark={color}>
	<span class="of">/ {formatUnit(target, unit)}</span>
	<div
		class="track"
		role="meter"
		aria-valuenow={value ?? undefined}
		aria-valuemin="0"
		aria-valuemax={target}
	>
		<span class="fill" class:reached style:width></span>
	</div>
</div>

<style>
	/* `baseline` on the row it sits in would drop the track below the figure's baseline, so this centres
	   itself against the digits instead. */
	.meter {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		flex: 1 1 auto;
		min-width: 0;
		align-self: center;
	}
	.of {
		color: var(--ink-3);
		font-size: var(--text-caption);
		white-space: nowrap;
		flex: none;
	}
	/* Takes whatever width is left, floored so a narrow card still shows a bar rather than a sliver. */
	.track {
		position: relative;
		flex: 1 1 auto;
		min-width: 24px;
		height: 8px;
		border-radius: var(--radius-sm);
		background: var(--inset);
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset-block: 0;
		left: 0;
		border-radius: var(--radius-sm);
		background: var(--mark);
	}
	.fill.reached {
		background: var(--role-saving);
	}
</style>
