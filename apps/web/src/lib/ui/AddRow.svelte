<script lang="ts">
	// "Type a name, press Add" — the shape of every create control in Manage. Extracted because the
	// copies had diverged on the detail that matters most: whether Enter submits.
	import { LEAF_MAX } from '$lib/forms/validate';

	interface Props {
		/** Text being typed (bindable). */
		value: string;
		placeholder?: string;
		/** Accessible name for the input — there is no visible label on a row this compact. */
		ariaLabel: string;
		label?: string;
		disabled?: boolean;
		/** Character ceiling; defaults to what the ledger accepts for a single account name. */
		maxlength?: number;
		onadd: () => void;
	}
	let {
		value = $bindable(),
		placeholder,
		ariaLabel,
		label = 'Add',
		disabled = false,
		maxlength = LEAF_MAX,
		onadd
	}: Props = $props();
</script>

<div class="addrow">
	<input
		aria-label={ariaLabel}
		bind:value
		{placeholder}
		{maxlength}
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
