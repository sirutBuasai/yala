<script lang="ts">
	// "Type a name, press Add" — the shape of every create control in Manage, including whether
	// Enter submits.
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
		class="field-input"
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
	}
	.addrow button {
		flex: none;
	}
</style>
