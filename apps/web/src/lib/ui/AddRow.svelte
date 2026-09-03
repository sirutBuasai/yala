<script lang="ts">
	// "Type a name, press Add" — the shape of every create control in Manage. Extracted because the
	// three copies had already diverged on the detail that matters most: whether Enter submits. One of
	// them would have been the odd one out sooner or later, and a create form where Enter does nothing
	// is a small papercut that never gets reported.
	import type { Snippet } from 'svelte';

	interface Props {
		/** Text being typed (bindable). */
		value: string;
		placeholder?: string;
		/** Accessible name for the input — there is no visible label on a row this compact. */
		ariaLabel: string;
		label?: string;
		disabled?: boolean;
		onadd: () => void;
		/** Extra control ahead of the input, e.g. a subtree picker. */
		before?: Snippet;
	}
	let {
		value = $bindable(),
		placeholder,
		ariaLabel,
		label = 'Add',
		disabled = false,
		onadd,
		before
	}: Props = $props();
</script>

<div class="addrow">
	{#if before}<div class="before">{@render before()}</div>{/if}
	<input
		aria-label={ariaLabel}
		bind:value
		{placeholder}
		{disabled}
		onkeydown={(e) => e.key === 'Enter' && onadd()}
	/>
	<button type="button" class="btn-accent" onclick={onadd} {disabled}>{label}</button>
</div>

<style>
	.addrow {
		display: flex;
		gap: var(--gap-inline);
		align-items: center;
		flex-wrap: wrap;
	}
	.before {
		flex: 0 1 auto;
		min-width: 0;
	}
	.addrow input {
		flex: 1;
		min-width: 8rem;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-family: inherit;
	}
	.addrow button {
		flex: none;
	}
</style>
