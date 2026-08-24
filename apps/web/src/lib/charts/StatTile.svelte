<script lang="ts">
	// Visualization for a Scalar primitive: the body of a stat tile (value + delta). Chrome-less
	// by design — it always lives inside a Pane, which supplies the card, the title (label) and
	// the subtitle (note), so a stat reads title → subtitle → value just like a chart pane.
	// Formatting comes from the unit, so data supplies raw numbers.
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

<div class="stat">
	{#if scalar.delta}
		<div class="delta {dir ?? ''}">{deltaText()}</div>
	{/if}
	<div class="num serif">{value}</div>
</div>

<style>
	/* Fill the pane body so the number can pin to the bottom: across a row, every tile's
	   main number aligns on one baseline regardless of subtitle length or a delta. Secondary
	   metrics (the delta) sit at the top under the subtitle and take the flexible space. */
	.stat {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
	}
	.num {
		font-size: 27px;
		font-weight: 600;
		letter-spacing: -0.5px;
		margin-top: auto;
	}
	.delta {
		font-size: 12px;
	}
	.up {
		color: var(--good-text);
	}
	.down {
		color: var(--crit-text);
	}
</style>
