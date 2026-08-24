<script lang="ts">
	// Visualization for a Scalar primitive: one KPI-style tile. Formatting comes from
	// the unit, so the data layer only supplies raw numbers.
	import type { Scalar } from '$lib/data/primitives';
	import { formatUnit } from '$lib/data/primitives';

	interface Props {
		scalar: Scalar;
	}
	let { scalar }: Props = $props();

	const value = $derived(scalar.value === null ? '—' : formatUnit(scalar.value, scalar.unit));
	const dir = $derived(scalar.delta?.dir ?? scalar.dir);

	function deltaText(): string {
		const d = scalar.delta;
		if (!d) return '';
		return formatUnit(d.value, d.unit) + (d.note ? ' ' + d.note : '');
	}
</script>

<div class="tile">
	<div class="label">{scalar.label}</div>
	<div class="num serif">{value}</div>
	{#if scalar.delta}
		<div class="delta {dir ?? ''}">{deltaText()}</div>
	{/if}
	{#if scalar.note}
		<div class="foot">{scalar.note}</div>
	{/if}
</div>

<style>
	.tile {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px 18px;
		box-shadow: var(--shadow);
	}
	.label {
		color: var(--ink-3);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.9px;
	}
	.num {
		font-size: 27px;
		font-weight: 600;
		margin-top: 7px;
		letter-spacing: -0.5px;
	}
	.delta {
		font-size: 12px;
		margin-top: 5px;
	}
	.up {
		color: var(--good-text);
	}
	.down {
		color: var(--crit-text);
	}
	.foot {
		color: var(--ink-3);
		font-size: 11.5px;
		margin-top: 3px;
	}
</style>
