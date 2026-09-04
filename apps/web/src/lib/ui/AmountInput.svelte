<script lang="ts">
	// The app's one money input: one place for the `type=number step=0.01 inputmode=decimal` rules
	// every amount field needs, so a missing one can't make the browser reject "12.50" or cost a phone
	// user the decimal keypad. The value is `number | null` rather than text — null is "nothing typed
	// yet", the state the forms validate against, so the parsing stays here.
	interface Props {
		/** Amount in currency units; null or undefined when empty (bindable). A caller may bind a
		    not-yet-created slot of a record, where absent and cleared mean the same thing. */
		value: number | null | undefined;
		id?: string;
		ariaLabel?: string;
		placeholder?: string;
		disabled?: boolean;
		/** Allow negatives — a refund or an adjustment. Off by default: most amounts are magnitudes. */
		signed?: boolean;
		/** Render the currency symbol inside the field, for tables where a label won't fit. */
		prefix?: string;
	}
	let {
		value = $bindable(),
		id,
		ariaLabel,
		placeholder = '0',
		disabled = false,
		signed = false,
		prefix
	}: Props = $props();
</script>

<span class="amountinput" class:has-prefix={!!prefix}>
	{#if prefix}<span class="prefix" aria-hidden="true">{prefix}</span>{/if}
	<input
		{id}
		type="number"
		step="0.01"
		min={signed ? undefined : 0}
		inputmode="decimal"
		aria-label={ariaLabel}
		{placeholder}
		{disabled}
		bind:value
	/>
</span>

<style>
	/* Without a prefix this is a plain field and inherits the shared `.field input` chrome from
	   app.css. With one, the wrapper takes over the border so the symbol sits INSIDE the field. */
	.amountinput {
		display: flex;
		align-items: center;
		min-width: 0;
	}
	.amountinput input {
		flex: 1;
		min-width: 0;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-family: inherit;
		/* Figures line up down a column of inputs, which is the whole point of a money field. */
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.has-prefix {
		gap: var(--space-2);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-5);
	}
	.has-prefix:focus-within {
		border-color: var(--lav);
	}
	.has-prefix .prefix {
		color: var(--ink-3);
		font-size: var(--text-meta);
	}
	/* The wrapper is the visible field now, so the inner input drops its own chrome — and its ring,
	   which would otherwise draw inside the border it no longer owns. */
	.has-prefix input {
		border: 0;
		background: none;
		border-radius: 0;
		padding: 0;
	}
	.has-prefix input:focus-visible {
		outline: none;
	}
</style>
