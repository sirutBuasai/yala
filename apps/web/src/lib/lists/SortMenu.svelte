<script lang="ts" generics="K extends string">
	// Reusable sort control for any list: a clickable "Sorted by X" label that opens the field
	// menu, plus an order-direction arrow. Owns no data — binds sortKey/sortDir for the caller.
	import Arrow from '$lib/icons/Arrow.svelte';
	import Select from '$lib/forms/Select.svelte';

	interface Props {
		/** The sortable fields, in menu order. */
		fields: { key: K; label: string }[];
		sortKey: K;
		sortDir: 'asc' | 'desc';
	}
	let { fields, sortKey = $bindable(), sortDir = $bindable() }: Props = $props();

	const keys = $derived(fields.map((f) => f.key));
	const labelOf = (k: K) => fields.find((f) => f.key === k)?.label ?? k;

	function toggleDir() {
		sortDir = sortDir === 'asc' ? 'desc' : 'asc';
	}
</script>

<div class="sortmenu">
	<Select
		value={sortKey}
		options={keys}
		optionLabel={(k) => labelOf(k as K)}
		ariaLabel="Sort field"
		triggerClass="chipbtn"
		onchange={(k) => (sortKey = k as K)}
	>
		{#snippet customTrigger()}
			<span class="sortlabel">Sorted by {labelOf(sortKey)}</span>
		{/snippet}
	</Select>
	<span class="sep" aria-hidden="true">·</span>
	<button
		class="iconbtn"
		aria-label={`Sort order: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
		onclick={toggleDir}
	>
		<Arrow dir={sortDir === 'asc' ? 'up' : 'down'} size={16} />
	</button>
</div>

<style>
	.sortmenu {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.sortlabel,
	.sep {
		color: var(--ink-3);
		font-size: var(--text-caption);
		white-space: nowrap;
	}
</style>
