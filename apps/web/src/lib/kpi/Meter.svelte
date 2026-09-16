<script lang="ts">
	// A figure against the level it is judged by, inline on the stat's own row. Unlike the other KPI marks
	// this one is not decorative — the fill IS the reading, on the same scaling rule as `BulletChart`.
	import { fillTo } from '$lib/charts/progress';
	import { formatUnit, type Unit } from '$lib/data/primitives';

	interface Props {
		value: number | null;
		target: number;
		unit: Unit;
		color: string;
	}
	let { value, target, unit, color }: Props = $props();

	const fill = $derived(fillTo(value, target));
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
		<span class="fill" class:reached={fill?.reached} style:width={fill?.width ?? '0%'}></span>
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
