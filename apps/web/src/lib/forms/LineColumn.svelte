<script module lang="ts">
	export interface AmountRow {
		value: string;
		amount: number | null;
	}
</script>

<script lang="ts">
	// A labeled column of {value, amount} rows: each row picks a value (Select) and an amount.
	// Reused for a paycheck's deduction/contribution lines and a transaction's credits.
	import Select from '$lib/forms/Select.svelte';

	interface Props {
		rows: AmountRow[];
		header: string;
		/** Label for the "add a row" button, e.g. "+ row" or "+ credit". */
		addLabel: string;
		options: string[];
		selectAriaLabel: string;
		optionLabel?: (v: string) => string;
		removable?: boolean;
		/** Value for a newly added row (default: the first option). */
		defaultValue?: string;
		/** When set, renders an inline creator whose entered name is passed here. */
		onCreateType?: (name: string) => void;
		createPlaceholder?: string;
	}
	let {
		rows = $bindable(),
		header,
		addLabel,
		options,
		selectAriaLabel,
		optionLabel = (v) => v,
		removable = true,
		defaultValue,
		onCreateType,
		createPlaceholder = 'new type'
	}: Props = $props();

	let newType = $state('');

	function add() {
		rows = [...rows, { value: defaultValue ?? options[0] ?? '', amount: null }];
	}
	function remove(i: number) {
		rows = rows.filter((_, idx) => idx !== i);
	}
	function create() {
		const name = newType.trim();
		if (!name) return;
		onCreateType?.(name);
		newType = '';
	}
</script>

<div class="linecol">
	<div class="linehdr">
		<span>{header}</span>
		<button type="button" class="btn-mini" onclick={add}>{addLabel}</button>
	</div>
	{#each rows as row, i (i)}
		<div class="linerow">
			<div class="grow">
				<Select ariaLabel={selectAriaLabel} bind:value={row.value} {options} {optionLabel} />
			</div>
			<input type="number" step="0.01" bind:value={row.amount} placeholder="0" />
			{#if removable}
				<button type="button" class="btn-mini rm" onclick={() => remove(i)}>✕</button>
			{/if}
		</div>
	{/each}
	{#if onCreateType}
		<div class="newtype">
			<input bind:value={newType} placeholder={createPlaceholder} />
			<button type="button" class="btn-mini" onclick={create}>+ type</button>
		</div>
	{/if}
</div>

<style>
	.linehdr {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		color: var(--ink-2);
		margin-bottom: 6px;
	}
	.linerow {
		display: flex;
		gap: 8px;
		margin-bottom: 6px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.linerow input {
		flex: 1;
		min-width: 0; /* shrink to fit the popup width; no horizontal scroll */
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: 8px;
		padding: 6px 9px;
		font-size: 12.5px;
		font-family: inherit;
	}
	.rm {
		flex: 0 0 auto;
	}
	.rm:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
	.newtype {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.newtype input {
		flex: 1;
		min-width: 0;
		background: var(--inset);
		border: 1px dashed var(--border);
		color: var(--ink);
		border-radius: 8px;
		padding: 6px 9px;
		font-size: 12px;
		font-family: inherit;
	}
	.newtype .btn-mini {
		flex: 0 0 auto;
	}
</style>
