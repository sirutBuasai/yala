<script lang="ts">
	// The body of a stat tile: value + delta, no chrome. It always lives inside a Pane, which supplies
	// the card, the title and the subtitle, so a stat reads like a chart pane.
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
	/* Fill the pane body so the number pins to the bottom: across a row, every tile's main number then
	   aligns on one baseline whatever the subtitle length or presence of a delta. */
	.stat {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
	}
	.num {
		font-size: var(--text-display);
		font-weight: var(--fw-semibold);
		letter-spacing: var(--ls-tighter);
		margin-top: auto;
	}
	.delta {
		font-size: var(--text-secondary);
	}
	.up {
		color: var(--good-text);
	}
	.down {
		color: var(--crit-text);
	}
</style>
