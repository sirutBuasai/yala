<script lang="ts">
	// One answer to a guided question, big enough to carry the reason it might be the right one. A row
	// by default; `tile` stacks it for a grid of many.
	interface Props {
		label: string;
		/** Why this one — the half-sentence that saves a hint line under the question. */
		why?: string;
		selected?: boolean;
		disabled?: boolean;
		onpick: () => void;
		tile?: boolean;
	}
	let { label, why, selected = false, disabled = false, onpick, tile = false }: Props = $props();
</script>

<button type="button" class="choice" class:tile aria-pressed={selected} {disabled} onclick={onpick}>
	<b>{label}</b>
	{#if why}<span class="why">{why}</span>{/if}
</button>

<style>
	.choice {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		width: 100%;
		background: var(--inset);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		padding: var(--space-6) var(--space-8);
		color: var(--ink);
		font: inherit;
		font-size: var(--text-body);
		text-align: left;
		cursor: pointer;
	}
	.choice:hover:not(:disabled) {
		border-color: var(--lav);
	}
	.choice[aria-pressed='true'] {
		border-color: var(--lav);
		background: color-mix(in srgb, var(--lav) 16%, transparent);
	}
	.choice:disabled {
		opacity: 0.5;
		cursor: default;
	}
	b {
		font-weight: var(--fw-medium);
	}
	.why {
		margin-left: auto;
		font-size: var(--text-caption);
		color: var(--ink-3);
		text-align: right;
	}
	/* Stacked, for a grid where the reason sits under the name rather than beside it. */
	.tile {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		border-radius: var(--radius-lg);
		height: 100%;
	}
	.tile .why {
		margin-left: 0;
		text-align: left;
	}
</style>
