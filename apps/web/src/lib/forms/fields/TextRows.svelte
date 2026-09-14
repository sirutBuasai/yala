<script module lang="ts">
	/** One free-text row. `was` is the value the row loaded with — null for a row just added — so a
	    caller can tell a rename from an addition. */
	export interface TextRow {
		value: string;
		was: string | null;
	}

	export const textRows = (values: string[]): TextRow[] =>
		values.map((value) => ({ value, was: value }));

	/** Split a value the user may have typed as a list, so pasting several at once still works. */
	export const splitRow = (value: string): string[] =>
		value
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean);

	/** Every row's text, one entry per comma-separated part, blanks dropped. */
	export const rowValues = (rows: TextRow[]): string[] => rows.flatMap((r) => splitRow(r.value));
</script>

<script lang="ts">
	// A labeled column of free-text rows, one name per row.
	import { LEAF_MAX } from '$lib/forms/validate';
	import { sentenceCase } from '$lib/utils/format';
	import RowColumn from '$lib/forms/fields/RowColumn.svelte';

	interface Props {
		rows: TextRow[];
		header: string;
		optional?: boolean;
		addLabel: string;
		/** What one row is called, in the add button and each row's spoken name. */
		noun: string;
		placeholder?: string;
		disabled?: boolean;
	}
	let {
		rows = $bindable(),
		header,
		optional = false,
		addLabel,
		noun,
		placeholder,
		disabled = false
	}: Props = $props();
</script>

<RowColumn
	bind:rows
	{header}
	{optional}
	{addLabel}
	{noun}
	{disabled}
	blank={() => ({ value: '', was: null })}
>
	{#snippet row(item, i)}
		<input
			class="field-input"
			aria-label={`${sentenceCase(noun)} ${i + 1}`}
			bind:value={item.value}
			{placeholder}
			maxlength={LEAF_MAX}
			{disabled}
		/>
	{/snippet}
</RowColumn>

<style>
	input {
		flex: 1;
		min-width: 0;
	}
</style>
