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
		/** Account a freshly added row starts on. Read at click time, so it can follow the form. */
		nextValue?: () => string;
	}
	let {
		rows = $bindable(),
		header,
		addLabel,
		options,
		selectAriaLabel,
		optionLabel = (v) => v,
		nextValue = () => options[0] ?? ''
	}: Props = $props();
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
