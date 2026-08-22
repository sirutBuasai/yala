<script lang="ts">
	interface Props {
		label: string;
		value: string;
		delta?: string;
		dir?: 'up' | 'down';
		foot?: string;
	}
	let { label, value, delta, dir, foot }: Props = $props();
</script>

<div class="tile">
	<div class="label">{label}</div>
	<div class="num serif">{value}</div>
	{#if delta}
		<div class="delta {dir ?? ''}">{delta}</div>
	{/if}
	{#if foot}
		<div class="foot">{foot}</div>
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
