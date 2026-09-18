<script module lang="ts">
	export interface AmountRow {
		value: string;
		amount: number | null;
	}
</script>

<script lang="ts">
	// A labeled column of {value, amount} rows, reused for a paycheck's deduction/contribution lines
	// and a transaction's credits.
	import RowColumn from '$lib/forms/fields/RowColumn.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';

	interface Props {
		rows: AmountRow[];
		header: string;
		/** Label for the add-a-row button, worded by the caller. */
		addLabel: string;
		options: string[];
		selectAriaLabel: string;
		optionLabel?: (v: string) => string;
		/** What the *first* row starts on, when there is no row above to follow. */
		firstValue?: string;
	}
	let {
		rows = $bindable(),
		header,
		addLabel,
		options,
		selectAriaLabel,
		optionLabel = (v) => v,
		firstValue = ''
	}: Props = $props();

	/** A row follows the one above it, so filling a column of related lines is one pick, not one per
	    row. Read at click time so it tracks whatever the last row was changed to. */
	const nextValue = () => rows.at(-1)?.value || firstValue || options[0] || '';
</script>

<RowColumn
	bind:rows
	{header}
	{addLabel}
	blank={() => ({ value: nextValue(), amount: null })}
	noun="line"
>
	{#snippet row(item)}
		<div class="cell">
			<Select ariaLabel={selectAriaLabel} bind:value={item.value} {options} {optionLabel} />
		</div>
		<div class="cell">
			<AmountInput bind:value={item.amount} ariaLabel="Amount" />
		</div>
	{/snippet}
</RowColumn>

<style>
	.cell {
		flex: 1;
		min-width: 0;
	}
</style>
