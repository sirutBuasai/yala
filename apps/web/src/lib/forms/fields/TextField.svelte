<script lang="ts">
	// A labelled single-line text field. The label doubles as the spoken name unless the caller needs
	// them to differ — a form asking for the same part of two accounts has to say which.
	import { TEXT_MAX } from '$lib/forms/validate';

	interface Props {
		label: string;
		value: string;
		/** Spoken name, when it has to be more specific than the visible label. */
		ariaLabel?: string;
		placeholder?: string;
		/** Marks the field optional beside its label. */
		optional?: boolean;
		/** Sizes the field as the answer to a question rather than as one field among several. */
		lead?: boolean;
		maxlength?: number;
		disabled?: boolean;
	}
	let {
		label,
		value = $bindable(),
		ariaLabel,
		placeholder,
		optional = false,
		lead = false,
		maxlength = TEXT_MAX,
		disabled = false
	}: Props = $props();
</script>

<label class="field" class:lead>
	<span
		>{label}{#if optional}{' '}<i>optional</i>{/if}</span
	>
	<input
		class="field-input"
		class:big={lead}
		aria-label={ariaLabel ?? label}
		bind:value
		{placeholder}
		{maxlength}
		{disabled}
	/>
</label>

<style>
	input {
		min-width: 0;
	}
	.lead {
		margin-bottom: var(--gap-field);
	}
	/* The question's own answer, sized to be the thing you look at. */
	.big {
		font-family: var(--font-display);
		font-size: var(--text-dialog);
		padding: var(--space-6) var(--space-7);
	}
</style>
