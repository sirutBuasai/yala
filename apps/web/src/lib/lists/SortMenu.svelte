<script lang="ts" generics="K extends string">
	// Reusable sort control for any list: a "Sorted by X" label, an order-direction arrow, and a
	// dots menu to pick the field. Owns no data — binds sortKey/sortDir for the caller to consume.
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
	<span class="orderctl">
		<span class="sortlabel">Sorted by {labelOf(sortKey)}</span>
		<span class="sep" aria-hidden="true">·</span>
		<button
			class="iconbtn"
			aria-label={`Sort order: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
			onclick={toggleDir}
		>
			<Arrow dir={sortDir === 'asc' ? 'up' : 'down'} size={16} />
		</button>
	</span>
	<Select
		value={sortKey}
		options={keys}
		optionLabel={(k) => labelOf(k as K)}
		ariaLabel="Sort field"
		triggerClass="iconbtn"
		align="right"
		onchange={(k) => (sortKey = k as K)}
	>
		{#snippet customTrigger()}
			<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				<circle cx="8" cy="3" r="1.5" fill="currentColor" />
				<circle cx="8" cy="8" r="1.5" fill="currentColor" />
				<circle cx="8" cy="13" r="1.5" fill="currentColor" />
			</svg>
		{/snippet}
	</Select>
</div>

<style>
	.sortmenu {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
	}
	.orderctl {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.sortlabel,
	.sep {
		color: var(--ink-3);
		font-size: var(--text-caption);
	}
</style>
