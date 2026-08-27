<script lang="ts" generics="V extends string">
	interface Props {
		options: { value: V; label: string }[];
		value: V;
		ariaLabel: string;
	}
	let { options, value = $bindable(), ariaLabel }: Props = $props();
</script>

<div class="seg" role="tablist" aria-label={ariaLabel}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === o.value}
			class:active={value === o.value}
			onclick={() => (value = o.value)}
		>
			{o.label}
		</button>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		gap: var(--space-1);
		padding: var(--space-1);
		margin-bottom: var(--space-8);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.seg button {
		padding: var(--pad-btn-sm);
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-size: var(--text-control);
		cursor: pointer;
	}
	.seg button:hover {
		color: var(--ink);
	}
	.seg button.active {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
	}
</style>
